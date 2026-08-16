import { expect, test } from "bun:test";

import {
	buildSummaryPrompt,
	mapAiError,
	normalizeSummaryLanguage,
	stripSummaryPreamble,
	summarizeEntry,
	summaryCacheKey,
	toPlainText,
} from "../../server/ai/index.ts";

test("normalizeSummaryLanguage maps locale codes", () => {
	expect(normalizeSummaryLanguage(undefined)).toBe("en");
	expect(normalizeSummaryLanguage("en-US")).toBe("en");
	expect(normalizeSummaryLanguage("de")).toBe("de");
	expect(normalizeSummaryLanguage("zh-CN")).toBe("zh");
	expect(normalizeSummaryLanguage("zh-Hans")).toBe("zh");
	expect(normalizeSummaryLanguage("fr")).toBe("en");
});

test("toPlainText strips HTML", () => {
	expect(toPlainText("<p>Hello <b>world</b> &amp; more</p>")).toBe("Hello world & more");
	expect(toPlainText("<script>bad()</script>ok")).toBe("ok");
});

test("summaryCacheKey includes version, content hash, model and language", () => {
	expect(summaryCacheKey("abc", "@cf/x/model", "en")).toBe("summary:v2:abc:@cf/x/model:en");
	expect(summaryCacheKey("abc", "@cf/x/model", "en")).not.toBe(
		summaryCacheKey("abc", "@cf/x/model", "de"),
	);
	expect(summaryCacheKey("abc", "@cf/x/model", "en")).not.toBe(
		summaryCacheKey("abc", "@cf/y/model", "en"),
	);
});

test("mapAiError maps status codes and internal codes", () => {
	expect(mapAiError({ status: 429 }).code).toBe("RATE_LIMITED");
	expect(mapAiError({ status: 408 }).code).toBe("TIMEOUT");
	expect(mapAiError({ status: 400, code: "3036" }).code).toBe("RATE_LIMITED");
	expect(mapAiError({ status: 403, code: "5035" }).code).toBe("UNAVAILABLE");
	expect(mapAiError({ status: 400, code: "5007" }).code).toBe("UNAVAILABLE");
	expect(mapAiError(new Error("boom")).code).toBe("UNKNOWN");
});

test("buildSummaryPrompt uses one template and just names the output language", () => {
	const en = buildSummaryPrompt("en", "T", "content");
	const de = buildSummaryPrompt("de", "T", "content");
	expect(en.messages).toHaveLength(2);
	expect(en.messages[0].role).toBe("system");
	expect(en.messages[1].content).toBe("Title: T\n\ncontent");
	expect(en.messages[0].content).toContain("English");
	expect(de.messages[0].content).toContain("German");
	// No per-language prompt variants: both share the same template.
	expect(en.messages[0].content.replace(/English/, "{lang}")).toBe(
		de.messages[0].content.replace(/German/, "{lang}"),
	);
	expect(en.messages[0].content).toMatch(/under 100 words/i);
	expect(en.messages[0].content).toMatch(/no preamble/i);
});

test("stripSummaryPreamble removes a leading 'here is a summary' line", () => {
	expect(stripSummaryPreamble("Here is a summary of the article: • Point one • Point two")).toBe(
		"• Point one • Point two",
	);
	expect(stripSummaryPreamble("Here's a concise summary:\n- A\n- B")).toBe("- A\n- B");
	expect(stripSummaryPreamble("  Just the summary.  ")).toBe("Just the summary.");
	expect(stripSummaryPreamble("summary: only the facts")).toBe("only the facts");
});

test("summarizeEntry is disabled by default", async () => {
	await expect(
		summarizeEntry({
			ai: {} as never,
			kv: {} as never,
			enabled: false,
			title: "t",
			content: "c",
		}),
	).rejects.toMatchObject({ code: "DISABLED" });
});

test("summarizeEntry returns a cached summary without calling the model", async () => {
	const calls: unknown[] = [];
	const result = await summarizeEntry({
		ai: {
			run: async (...args: unknown[]) => {
				calls.push(args);
				return { response: "x" };
			},
		} as never,
		kv: { get: async () => "cached summary" } as never,
		enabled: true,
		title: "T",
		content: "content",
		lang: "en",
	});
	expect(result).toEqual({
		summary: "cached summary",
		model: "@cf/meta/llama-3.1-8b-instruct-fp8-fast",
		modelLabel: "Llama 3.1 8B",
		cached: true,
	});
	expect(calls).toHaveLength(0);
});

test("summarizeEntry generates and caches a new summary", async () => {
	let modelCalled = false;
	const stored = new Map<string, string>();
	const result = await summarizeEntry({
		ai: {
			run: async () => {
				modelCalled = true;
				return { response: "  Short summary.  " };
			},
		} as never,
		kv: {
			get: async () => null,
			put: async (key: string, value: string) => {
				stored.set(key, value);
			},
		} as never,
		enabled: true,
		title: "T",
		content: "some article content",
		lang: "de",
	});
	expect(modelCalled).toBe(true);
	expect(result.cached).toBe(false);
	expect(result.summary).toBe("Short summary.");
	expect(result.model).toBe("@cf/meta/llama-3.1-8b-instruct-fp8-fast");
	expect(stored.size).toBe(1);
	expect(stored.values().next().value).toBe("Short summary.");
});

test("summarizeEntry rejects empty model output as malformed", async () => {
	await expect(
		summarizeEntry({
			ai: { run: async () => ({ response: "" }) } as never,
			kv: { get: async () => null } as never,
			enabled: true,
			title: "T",
			content: "content",
		}),
	).rejects.toMatchObject({ code: "MALFORMED" });
});
