/**
 * Versioned summarization prompts. Bump `SUMMARY_PROMPT_VERSION` whenever the
 * prompt template changes — it is part of the cache key, so changing the
 * template transparently invalidates stale cached summaries.
 */

export const SUMMARY_PROMPT_VERSION = "v2";

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

/**
 * Human-readable language label (e.g. "German") for the *requested* output
 * language. Invalid / unknown codes fall back to English ("English").
 */
function languageLabel(lang: string): string {
	return languageNames.of(lang) ?? "English";
}

/**
 * Build a scoped (chat-style) prompt for the given article. A single template
 * is used for every language — only the requested output language changes,
 * which the models follow reliably without full per-language prompts. The
 * model is told to output nothing but the summary: no preamble, no chatting,
 * and to keep it short.
 */
export function buildSummaryPrompt(
	lang: string,
	title: string,
	content: string,
): { messages: Array<{ role: "system" | "user"; content: string }> } {
	const system = [
		"You write concise article summaries.",
		`Write the summary in ${languageLabel(lang)}.`,
		'Output only the summary itself: no preamble, no labels, no "here is a summary",',
		"no commentary, no questions, and do not address the reader.",
		"Use 3-5 short sentences that capture the key points and conclusions.",
		"Keep it under 100 words.",
		"Do not use markdown or any formatting: output plain text only.",
		"Output only a single paragraph with no line breaks.",
	].join(" ");
	return {
		messages: [
			{ role: "system", content: system },
			{ role: "user", content: `Title: ${title}\n\n${content}` },
		],
	};
}
