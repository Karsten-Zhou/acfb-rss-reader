/**
 * Versioned summarization prompts. Bump `SUMMARY_PROMPT_VERSION` whenever the
 * prompt template changes — it is part of the cache key, so changing the
 * template transparently invalidates stale cached summaries.
 */

export const SUMMARY_PROMPT_VERSION = "v2";

export type SummaryLanguage = "en" | "de" | "zh";

export function normalizeSummaryLanguage(lang: string | undefined | null): SummaryLanguage {
	switch (lang?.toLowerCase()) {
		case "de":
			return "de";
		case "zh":
		case "zh-cn":
		case "zh-hans":
		case "zh-hans-cn":
			return "zh";
		default:
			return "en";
	}
}

const LANGUAGE_LABELS: Record<SummaryLanguage, string> = {
	en: "English",
	de: "German",
	zh: "Simplified Chinese",
};

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
		`Write the summary in ${LANGUAGE_LABELS[lang]}.`,
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
