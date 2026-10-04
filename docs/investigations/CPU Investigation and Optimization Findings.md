# Cloudflare RSS Reader — CPU Investigation and Optimization Findings

**Status:** Investigation complete — no further local optimization planned
**Repository state:** clean, matches commit `8c3f398`
**Date:** 2026-10-04

## Executive summary

The RSS reader's Cloudflare Worker CPU usage is dominated by XML feed parsing, specifically `@extractus/feed-extractor` and its `fast-xml-parser` dependency.

Several possible optimizations were investigated experimentally. Most were either ineffective, source-specific, or introduced semantic/correctness regressions.

The investigation should stop here.

The only remaining technically interesting optimization is upstream: **fuse XML validation and parsing into a single pass** inside `fast-xml-parser`, preserving the current validation behavior. A local `skipValidation` patch was investigated but rejected because `XMLParser.parse()` does **not** provide equivalent malformed-XML protection.

---

# Production observations

The production Worker is a low-traffic personal RSS reader.

Over a 7-day observation period:

* **733 requests**
* **52.6 s total CPU**
* P50: **2.7 ms**
* P90: **280 ms**
* P99: **451 ms**

The CPU is overwhelmingly concentrated in scheduled refreshes:

* approximately 170 hourly/refresh requests
* roughly 23% of all requests
* but **>95% of total CPU**

Ordinary API requests generally consume only **1–8 ms**.

Refreshes typically consume approximately **180–440 ms CPU**, with around **260 ms** being representative.

There are currently **13 feeds**.

Cached feed bodies range approximately from **15 KB to 116 KB**, for roughly **660 KB** of total feed data.

Production refreshes run every **30 minutes**.

---

# Architecture / operational note

The deployed Worker is named:

`rss-reader`

The repository's `wrangler.jsonc` currently names the Worker:

`acfb-rss-reader`

and does not contain the production D1/KV identifiers.

Therefore:

> `bun run deploy` does not currently represent a safe way to update the production Worker.

This is separate from the CPU investigation, but should be fixed/documented independently if deployment from this repository is expected to be supported.

---

# CPU investigation

A dedicated lab Worker was created and tested against real Cloudflare execution.

The lab environment included:

* Worker: `acfb-rss-reader-cpu-lab`
* D1: `rss-reader-cpu-lab`
* KV: `rss-reader-cpu-lab-kv`

The lab cron was removed after the investigation.

The lab environment can be deleted when no longer needed.

---

## Workflow overhead

A Cloudflare Workflow invocation itself was not the primary problem.

Observed approximately:

* cron invocation: **~5 ms**
* Workflow `run()`: **~225 ms** in the original full workload

Ablation showed:

| Workload                       |      Approx. CPU |
| ------------------------------ | ---------------: |
| Workflow with no feeds         |            ~4 ms |
| + 12 HTTP fetches + 12 KV puts |        ~13–17 ms |
| + `parseFeedDocument`          |   **~35–247 ms** |
| + `ingestFeed`                 | ~0 ms additional |
| + feed update/fetch logging    |          ~225 ms |

The exact numbers varied substantially between cold and warm isolates, but the conclusion was stable:

> **XML parsing is the dominant CPU consumer.**

D1 was not the problem.

---

# D1 investigation

Approximately 145 D1 statements were executed during a representative refresh.

Changing the workload to one statement showed approximately the same database CPU contribution:

* ~11 ms

Therefore:

> D1 query count is not the material source of refresh CPU.

The application-level `withD1Retry` Proxy also measured approximately **34 ms**, but this was not the dominant component and was not pursued further.

---

# Cold vs warm isolates

The same parsing workload showed a very large cold/warm difference.

Representative observation:

* cold: **~200 ms**
* warm: **~35 ms**

This is approximately a **7× difference**.

This matters because the application has low traffic and Cloudflare Worker isolates can therefore be cold when scheduled refreshes occur.

This also means microbenchmarks from a warm local/runtime state should not be interpreted directly as production refresh CPU.

---

# Parsing scales with input size

An early hypothesis was that parsing had a mostly fixed per-isolate cost.

Further testing disproved this.

Representative scaling results:

| Number of feeds | Approx. CPU |
| --------------: | ----------: |
|               1 |      ~36 ms |
|               4 |      ~52 ms |
|              13 |     ~197 ms |

The observed relationship was approximately:

> **~25 ms fixed + ~0.25 µs/byte parsed**

There was substantial run-to-run variance; 13-feed runs ranged approximately **36–305 ms**.

Conclusion:

> Parsing CPU genuinely scales with the amount of XML processed.

Splitting the work into multiple invocations/isolates therefore should not be treated as an optimization. It could instead increase cold-start/JIT costs.

---

# Conditional HTTP requests

The application already uses:

* `If-None-Match`
* `If-Modified-Since`

An initial observation suggested approximately 75% of requests returned HTTP 304.

Further investigation showed that this was an artifact of Steam's approximately 120-second origin/cache behavior in the laboratory polling setup.

Observed behavior:

| Time since previous fetch |            304 rate |
| ------------------------- | ------------------: |
| <120 s                    | 401 / 551 = **73%** |
| 120 s–5 min               |  37 / 218 = **17%** |
| 5–30 min                  |     0 / 64 = **0%** |
| >30 min                   |     0 / 31 = **0%** |

Production refreshes occur every 30 minutes.

Therefore:

> Conditional requests do **not** materially reduce production parser CPU.

---

# Generic byte-level change detection

A generic raw-byte hash was tested as a way to avoid parsing unchanged feeds.

This did not provide a useful production optimization.

A realistic test interval of approximately 135 seconds, deliberately beyond the Steam 120-second origin-cache behavior, produced:

* 3/3 distinct responses
* no useful skips

A generic-only implementation produced:

* 1 skip out of 39 refreshes (~2.6%)
* CPU measurements of approximately 305 / 295 / 216 ms

The approach was reverted.

---

# Normalized hashing

A more sophisticated normalization was tested, including:

* stripping XML comments
* canonicalizing rotating Steam CDN hostnames

This produced impressive-looking measurements:

> 207 → 131 → 51 → 49 ms

However, the improvement came entirely from the Steam-specific CDN alias normalization.

That is not a generic RSS optimization and would amount to encoding source-specific knowledge into the reader.

It was therefore rejected.

---

# Semantic fingerprinting

Another possible direction was to scan the XML for only fields that affect article extraction and build a semantic fingerprint without fully parsing the document.

This was rejected because reliably locating and interpreting:

* RSS/Atom structures
* titles
* links
* dates
* descriptions
* content
* namespaces
* CDATA
* entities
* feed-specific variants

would effectively amount to implementing another XML/RSS parser.

That would introduce considerably more complexity and correctness risk than the CPU saving justifies.

---

# Source-specific fast parser

A source-specific parser was also considered.

This was rejected because:

1. The reader is intended to handle generic RSS/Atom feeds.
2. The application must not silently lose articles when a source changes format.
3. The repository's `AGENTS.md` explicitly discourages this type of shortcut.
4. The maintenance burden would be substantially larger than the expected benefit.

---

# `feed-extractor` validation overhead

`@extractus/feed-extractor` internally performs approximately:

1. `XMLValidator.validate(xml)`
2. `XMLParser.parse(xml)`
3. feed mapping/normalization

A clean isolated benchmark measured approximately:

| Operation              |          CPU |
| ---------------------- | -----------: |
| XML validation         |  **6.14 ms** |
| XML parsing            | **21.96 ms** |
| Mapping/normalization  |  **~5.9 ms** |
| `extractFromXml` total | **34.00 ms** |

Thus validation accounts for approximately **18% of the measured total** in this benchmark.

Cold `workerd` measurements suggested roughly **20–25%** of the relevant parser work.

This is a genuine optimization opportunity.

However, the validation step is **not redundant from a correctness perspective**.

---

# Important correction: `XMLParser.parse()` is not a validation substitute

A local patch was investigated that would change:

```js
if (!validate(xml)) {
```

to:

```js
if (!options.skipValidation && !validate(xml)) {
```

The motivation was to skip the first XML scan because `XMLParser.parse()` was initially assumed to reject malformed XML itself.

That assumption was tested directly and found to be false.

Malformed XML test results:

| Case               | With validation | `skipValidation: true`               |
| ------------------ | --------------- | ------------------------------------ |
| Unclosed `<item>`  | throws          | **does not throw; parsed 1 entry**   |
| Mismatched close   | throws          | **does not throw; parsed 0 entries** |
| Truncated document | throws          | **does not throw; parsed 0 entries** |
| Unquoted attribute | throws          | **does not throw; parsed 0 entries** |
| Stray close        | throws          | throws                               |
| Not XML            | throws          | throws                               |
| Empty              | throws          | throws                               |
| Two roots          | throws          | throws                               |

The most dangerous case is the unclosed `<item>`:

> A truncated/malformed response can be accepted as a valid feed and produce an article.

The 0-entry cases are also problematic because they can cause the application to treat a malformed feed as successfully processed rather than incrementing its error state.

Therefore:

> **Removing XML validation is a correctness regression.**

The local `skipValidation` patch was consequently abandoned.

---

# Important positive result of the validation experiment

Although skipping validation is unsafe, the experiment established something useful:

For well-formed XML:

> `XMLValidator.validate()` followed by `XMLParser.parse()` produces the same parsed output as parsing alone.

So the work is duplicated on the happy path.

The correct optimization is therefore **not removal of validation**, but **fusion of validation and parsing**.

---

# Recommended upstream direction

`fast-xml-parser` already has a TODO concerning combining validator and parser work.

That is exactly the appropriate upstream optimization.

The desired behavior is:

```text
XML input
   │
   ▼
single traversal
   ├── parser state
   ├── well-formedness checks
   └── parsed representation
   │
   ▼
same validation guarantees
without a second full XML scan
```

This should preserve the current malformed-input contract while eliminating the duplicated traversal.

An upstream issue should therefore **not** request:

> "Add `skipValidation`."

It should instead request:

> **Fuse XML validation and parsing into one pass while preserving the current validation behavior.**

The measured data provides a strong justification:

* validation ≈ 6.1 ms
* parsing ≈ 22.0 ms
* validation ≈ 18% of the isolated total
* XML parsing dominates the Worker refresh CPU
* removing validation outright is unsafe because the parser accepts malformed documents that the validator rejects

This is a much stronger and more accurate upstream request.

---

# `stopNodes` investigation

`fast-xml-parser`'s `stopNodes` option initially appeared promising because RSS descriptions and HTML-heavy content can contain large amounts of text that do not need XML tokenization.

Warm benchmarks initially showed:

| Configuration                 |    Median |     Change |
| ----------------------------- | --------: | ---------: |
| Baseline                      |  34.38 ms |          — |
| `*.description`               |  19.77 ms | **−42.5%** |
| `*.content:encoded`           |  29.65 ms |     −13.7% |
| `*.summary`                   |  34.12 ms |      −0.7% |
| `*.content`                   |  34.40 ms |      +0.1% |
| description + content:encoded | ~19.85 ms | **−42.3%** |

This looked highly promising.

However, application-level testing exposed a semantic problem.

`stopNodes` returns the source slice instead of performing the normal parser semantics for that node.

For example, baseline output contained decoded HTML such as:

```html
<div class="bb_h3">CHANGELOG</div><br><b>Improvements</b>
```

whereas the stopped node contained escaped source such as:

```text
&lt;div class=&quot;bb_h3&quot;&gt;CHANGELOG&lt;/div&gt;&lt;br&gt;...
```

Additionally, CDATA markers could leak through literally.

The effect was widespread:

* **12 of 13 feeds** were affected
* content/summary character volume increased from approximately **502,922 → 622,649** (~24%)

An earlier deep-equality result was found to be misleading because it compared the final `feed-extractor` normalized output rather than the raw fields consumed by the application's own `getExtraEntryFields` logic.

Therefore:

> `stopNodes` is not a drop-in optimization for this application.

Making it correct would require reproducing the entity decoding / CDATA semantics that the normal XML parser already provides, effectively moving complexity back into application code.

The optimization was rejected.

---

# Dependency deduplication experiment

A dependency override was added:

```json
"overrides": {
  "fast-xml-parser": "^5.11.0"
}
```

This deduplicated `fast-xml-parser` and reduced the Worker bundle.

Measured changes:

| Metric      |      Before |       After |
| ----------- | ----------: | ----------: |
| Upload size | 1370.35 KiB | 1310.37 KiB |
| Gzip        |  255.71 KiB |  243.42 KiB |
| Startup     |       48 ms |       36 ms |

So:

* upload: **−4.4%**
* gzip: **−4.8%**
* startup: **−12 ms / −25%**

However, refresh CPU did not improve:

* before median: **57 ms**
* after median: **62 ms**
* n=8

Conclusion:

> The duplicate dependency primarily affected bundle/startup behavior, not the dominant refresh execution path.

The override remains in the final clean state only insofar as commit `8c3f398` contains the dependency cleanup; no further parser optimization was obtained from it.

Current dependency state:

* single `fast-xml-parser`
* version **5.11.0**
* no remaining experimental patch
* direct temporary bump to 5.11.2 was reverted

---

# Worker startup check

Installed Wrangler 4.123.0 could not run `wrangler check startup` because its bundled `workerd` had a maximum supported compatibility date of 2026-08-18 while the project uses 2026-09-16.

Using:

```text
npx wrangler@4.147.0 check startup
```

worked.

Result:

* bundle: **785.12 KiB**
* gzip: **181.80 KiB**
* active startup: **56.2 ms**
* GC: **3.2 ms**
* 33 samples
* CPU profile written to `worker-startup.cpuprofile`

This confirmed that startup/bundle costs exist, but they are separate from the dominant refresh parsing problem.

---

# Runtime timing caveat

An important measurement detail:

Inside `workerd`, synchronous calls to:

```js
Date.now()
performance.now()
```

did not advance during synchronous CPU-heavy parsing.

In-Worker measurements therefore incorrectly showed approximately zero elapsed time for some synchronous parser operations.

Reliable measurements came from:

* Cloudflare Worker CPU analytics
* `wrangler tail`
* controlled ablation experiments
* comparisons between otherwise identical executions

This should be remembered if future Worker CPU experiments are performed.

---

# Final assessment

The investigation considered the major plausible optimization paths.

| Approach                           | Result                                                    | Decision                      |
| ---------------------------------- | --------------------------------------------------------- | ----------------------------- |
| D1 optimization                    | Not the bottleneck                                        | Stop                          |
| Workflow optimization              | Not the main cost                                         | Stop                          |
| Conditional HTTP requests          | Production refreshes get essentially no 304s              | Stop                          |
| Generic raw hashing                | Almost no skips                                           | Reject                        |
| Source-specific normalized hashing | Worked only through Steam-specific knowledge              | Reject                        |
| Semantic fingerprinting            | Would become another parser                               | Reject                        |
| Source-specific parser             | Complexity/correctness risk                               | Reject                        |
| Split into more invocations        | Could increase cold-start costs                           | Reject                        |
| Dependency deduplication           | Improves startup/bundle only                              | Keep cleanup, no CPU win      |
| `stopNodes`                        | ~42% parser improvement but changes semantics             | Reject                        |
| `skipValidation`                   | ~18–25% opportunity but breaks malformed-input guarantees | **Reject**                    |
| Validation/parser fusion           | Preserves semantics and removes duplicate scan            | **Best upstream opportunity** |

The dominant remaining CPU cost is therefore genuine XML parsing work.

There is no remaining local optimization identified that is both:

1. generic,
2. semantically safe,
3. maintainable, and
4. large enough to justify its complexity.

---

# Final repository state

At the end of the investigation:

* repository is clean
* tree matches commit `8c3f398`
* **91/91 tests pass**
* lint passes
* typecheck passes
* build passes
* no `skipValidation` implementation remains
* no `patchedDependencies` entry remains
* no `stopNodes` optimization remains
* production Worker was not modified by the experiments

The malformed-XML experiment specifically prevented an unsafe local optimization from being committed.

---

# Recommended next steps

No further CPU investigation is currently justified.

Optional:

1. Keep commit `8c3f398` as the final optimization state.
2. Tear down the temporary CPU-lab Worker/D1/KV resources.
3. File an upstream `fast-xml-parser` issue describing **validation/parser fusion**, not `skipValidation`.
4. Correct the earlier assumption that parser failure makes explicit validation redundant.
5. Leave the local implementation alone unless upstream eventually provides a safe single-pass implementation.

The expected benefit of a future fused validator/parser implementation is meaningful but limited: roughly the validation component of the parser workload, not an order-of-magnitude reduction in refresh CPU.

## Bottom line

**The investigation found the bottleneck, tested the obvious escape routes, rejected the unsafe ones with real correctness evidence, and identified the appropriate upstream fix.**

Further local optimization would now have a poor complexity-to-benefit ratio.
