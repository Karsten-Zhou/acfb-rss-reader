# Environment & Secrets

## Variables

| Variable                  | Kind     | Description                                        |
| ------------------------- | -------- | -------------------------------------------------- |
| `GITHUB_CLIENT_ID`        | secret   | GitHub OAuth App client ID                         |
| `GITHUB_CLIENT_SECRET`    | secret   | GitHub OAuth App client secret                     |
| `ALLOWED_GITHUB_USER_ID`  | secret   | Numeric GitHub user ID of the only allowed user    |
| `APP_ORIGIN`              | secret   | Public origin of the app, e.g. `https://x.workers.dev` or `http://localhost:8787` |
| `DB`                      | binding  | D1 database binding (`rss-reader-db`)              |
| `KV_STORE`                | binding  | KV namespace for cache + OAuth state               |
| `REFRESH_WORKFLOW`        | binding  | Workflows binding for feed refreshes               |

> **Getting your numeric GitHub user ID** (for `ALLOWED_GITHUB_USER_ID`): the
> app matches the numeric ID, not your username. No authentication is needed —
> open `https://api.github.com/users/<your-username>` in a browser and read the
> `"id"` field from the JSON.

## Local development

Copy `.dev.vars.example` to `.dev.vars` and fill in your values.
`.dev.vars` is git-ignored — never commit it.

### Remote bindings in local dev

Both `DB` (D1) and `KV_STORE` (KV) are configured with `remote: true` in
`wrangler.jsonc`. This means local development connects to the **real**
(remote) D1 database and KV namespace while the Worker code still runs
locally in `workerd`. This keeps local dev data consistent with production
(after applying migrations with `bun run db:migrate`).

Caveats:

- Writes/deletes during local dev affect the real resources (D1 and KV) and
  incur the same usage/billing (KV free tier covers 100k reads/day and 1k
  writes/day — plenty for this app's favicon/OAuth/feed-body caches).
- Requires `wrangler login` (or `CLOUDFLARE_API_TOKEN`) and network access to
  the Cloudflare API.
- To run against purely local simulations instead, temporarily remove the
  `"remote": true` flags (or run with `--local` when using `wrangler dev`
  directly).
- Restart `bun run dev` after changing these flags.

## Production

Set secrets with `wrangler secret put <NAME>` (interactive) or via the
Cloudflare dashboard. Bindings (`DB`, `KV_STORE`, `REFRESH_WORKFLOW`) are
declared in `wrangler.jsonc`.
