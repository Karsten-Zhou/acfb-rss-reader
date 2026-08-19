import { KV_SUMMARY_TTL_SECONDS, sha256Hex } from "../../shared/index.ts";
import { DEFAULT_SUMMARY_MODEL, SUMMARY_MODELS } from "./models.ts";
import { buildSummaryPrompt } from "./prompts.ts";

export type SummaryErrorCode =
	| "DISABLED"
	| "NO_CONTENT"
	| "UNAVAILABLE"
	| "RATE_LIMITED"
	| "TIMEOUT"
	| "MALFORMED"
	| "UNKNOWN";

export class SummaryError extends Error {
	constructor(
		public readonly code: SummaryErrorCode,
		message: string,
	) {
		super(message);
		this.name = "SummaryError";
	}
}

export interface SummaryResult {
	summary: string;
	model: string;
	modelLabel: string;
	cached: boolean;
}

/** Cheap HTML → plain text conversion for AI input (no DOM on the server). */
export function toPlainText(html: string): string {
	return html
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#0*39;/gi, "'")
		.replace(/\s+/g, " ")
		.trim();
}

/** KV key for a generated summary. Includes content hash, model and language. */
export function summaryCacheKey(contentHash: string, modelId: string, lang: string): string {
	return `summary:${contentHash}:${modelId}:${lang}`;
}

export async function getCachedSummary(
	kv: KVNamespace,
	contentHash: string,
	modelId: string,
	lang: string,
): Promise<string | null> {
	return kv.get(summaryCacheKey(contentHash, modelId, lang));
}

async function cacheSummary(
	kv: KVNamespace,
	contentHash: string,
	modelId: string,
	lang: string,
	summary: string,
): Promise<void> {
	await kv.put(summaryCacheKey(contentHash, modelId, lang), summary, {
		expirationTtl: KV_SUMMARY_TTL_SECONDS,
	});
}

/** Map a Workers AI failure to a friendly SummaryError code. */
export function mapAiError(err: unknown): SummaryError {
	const status =
		typeof err === "object" && err !== null && "status" in err
			? Number((err as { status?: unknown }).status)
			: undefined;
	const code =
		typeof err === "object" && err !== null && "code" in err
			? String((err as { code?: unknown }).code)
			: undefined;

	// 429 or account-limited / out-of-capacity codes.
	if (status === 429 || code === "3036" || code === "3040") {
		return new SummaryError("RATE_LIMITED", "AI rate limit or daily quota exceeded");
	}
	// Timeout / aborted.
	if (status === 408 || code === "3007" || code === "3008") {
		return new SummaryError("TIMEOUT", "The AI request timed out");
	}
	// Everything else (unknown model, agreement, paid-plan required, blocked…).
	if (status !== undefined && status >= 400) {
		return new SummaryError("UNAVAILABLE", "The AI model is currently unavailable");
	}
	return new SummaryError("UNKNOWN", "The AI request failed");
}

export interface SummarizeOptions {
	ai: Ai;
	kv: KVNamespace;
	/** "true" enables summaries (disabled by default). */
	enabled: boolean;
	title: string;
	/** Plain-text article content (already stripped of HTML). */
	content: string;
	/** UI language for the summary. */
	lang?: string;
	/** Optional model key from the summary model registry. */
	model?: string;
}

/**
 * Generate (or return a cached) summary for an article. The cache key is a
 * hash of the content + model + prompt version + language, so the same
 * article only triggers one inference per model/language until the prompt
 * template changes or the TTL expires.
 */
export async function summarizeEntry(options: SummarizeOptions): Promise<SummaryResult> {
	if (!options.enabled) {
		throw new SummaryError("DISABLED", "AI summaries are not enabled");
	}
	const content = options.content.trim();
	if (!content) {
		throw new SummaryError("NO_CONTENT", "The article has no text to summarize");
	}

	const lang = options.lang ?? "en";
	const model = options.model
		? (SUMMARY_MODELS[options.model] ?? SUMMARY_MODELS[DEFAULT_SUMMARY_MODEL])
		: SUMMARY_MODELS[DEFAULT_SUMMARY_MODEL];
	if (!model) throw new SummaryError("UNAVAILABLE", "No summary model configured");

	const contentHash = await sha256Hex(content);
	const cached = await getCachedSummary(options.kv, contentHash, model.id, lang);
	if (cached) {
		return { summary: cached, model: model.id, modelLabel: model.label, cached: true };
	}

	const truncated = content.slice(0, model.maxInputChars);
	const input = buildSummaryPrompt(lang, options.title, truncated);

	let raw: unknown;
	try {
		raw = await options.ai.run(model.id, {
			...input,
			max_tokens: model.maxTokens,
		});
	} catch (err) {
		throw mapAiError(err);
	}

	const response = (raw as { response?: unknown } | null)?.response;
	if (typeof response !== "string" || response.trim().length === 0) {
		throw new SummaryError("MALFORMED", "The model returned an empty response");
	}
	const summary = stripSummaryPreamble(response);

	await cacheSummary(options.kv, contentHash, model.id, lang, summary);
	return { summary, model: model.id, modelLabel: model.label, cached: false };
}

/**
 * Drop a leading "Here is a summary of the article: …" preamble if a model
 * adds one despite the prompt, so the cached result is only the summary.
 */
export function stripSummaryPreamble(text: string): string {
	const cleaned = text
		.replace(
			/^(here['’]?s |here is |here are )?(a |an |the )?(brief |short |concise |quick )?summary[^:\n]*:\s*/i,
			"",
		)
		.trim();
	return cleaned.length > 0 ? cleaned : text.trim();
}
