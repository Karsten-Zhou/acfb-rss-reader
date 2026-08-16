/**
 * Versioned summarization prompts. Bump `SUMMARY_PROMPT_VERSION` whenever the
 * prompt template changes — it is part of the cache key, so changing the
 * template transparently invalidates stale cached summaries.
 */

export const SUMMARY_PROMPT_VERSION = "v2";

export type SummaryLanguage = "en" | "de" | "zh";

const SUPPORTED_LANGUAGES: ReadonlySet<string> = new Set(["en", "de", "zh"]);

/**
 * Resolve an arbitrary locale string (e.g. "zh-CN", "zh-Hans", "en-US") to one
 * of the supported summary languages using the platform's locale parser,
 * falling back to "en" for unsupported or unparseable input.
 */
export function normalizeSummaryLanguage(lang: string | undefined | null): SummaryLanguage {
	if (!lang) return "en";
	let code: string;
	try {
		code = new Intl.Locale(lang).language;
	} catch {
		return "en";
	}
	return SUPPORTED_LANGUAGES.has(code) ? (code as SummaryLanguage) : "en";
}

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

/** Human-readable language name (e.g. "German"), for embedding in the prompt. */
function languageLabel(lang: SummaryLanguage): string {
	return languageNames.of(lang) ?? lang;
}

/**
 * Build a scoped (chat-style) prompt for the given article. A single template
 * is used for every language — only the requested output language changes,
 * which the models follow reliably without full per-language prompts. The
 * model is told to output nothing but the summary: no preamble, no chatting,
 * and to keep it short.
 */
export function buildSummaryPrompt(
	lang: SummaryLanguage,
	title: string,
	content: string,
): { messages: Array<{ role: "system" | "user"; content: string }> } {
	const system = [
		"You write concise article summaries.",
		`Write the summary in ${languageLabel(lang)}.`,
		'Output only the summary itself: no preamble, no labels, no "here is a summary",',
		"no commentary, no questions, and do not address the reader.",
		"Use 3-5 short sentences or bullet points that capture the key points and conclusions.",
		"Keep it under 100 words.",
	].join(" ");
	return {
		messages: [
			{ role: "system", content: system },
			{ role: "user", content: `Title: ${title}\n\n${content}` },
		],
	};
}
