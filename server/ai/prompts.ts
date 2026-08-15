/**
 * Versioned summarization prompts. Bump `SUMMARY_PROMPT_VERSION` whenever the
 * prompt template changes — it is part of the cache key, so changing the
 * template transparently invalidates stale cached summaries.
 */

export const SUMMARY_PROMPT_VERSION = "v1";

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

const SYSTEM_PROMPTS: Record<SummaryLanguage, string> = {
	en: "You are a helpful reading assistant. Write a concise, neutral summary of the article in English: 3-5 short bullet points or sentences that capture the key points and conclusions. Do not add opinions, advice, or commentary beyond the article.",
	de: "Du bist ein hilfreicher Lese-Assistent. Fasse den Artikel knapp und sachlich auf Deutsch in 3-5 Stichpunkten oder kurzen Sätzen zusammen und erfasse die Kernaussagen und Schlussfolgerungen. Füge keine Meinungen, Ratschläge oder Kommentare hinzu, die über den Artikel hinausgehen.",
	zh: "你是一位有用的阅读助手。请用中文以 3-5 条要点或短句简洁、客观地总结这篇文章，抓住关键观点和结论。不要添加文章之外的看法、建议或评论。",
};

/** Build a scoped (chat-style) prompt for the given article. */
export function buildSummaryPrompt(
	lang: SummaryLanguage,
	title: string,
	content: string,
): { messages: Array<{ role: "system" | "user"; content: string }> } {
	return {
		messages: [
			{ role: "system", content: SYSTEM_PROMPTS[lang] },
			{ role: "user", content: `Title: ${title}\n\n${content}` },
		],
	};
}
