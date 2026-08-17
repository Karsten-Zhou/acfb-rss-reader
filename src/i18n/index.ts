import de from "./locales/de.ts";
import en from "./locales/en.ts";
import zhCN from "./locales/zh-CN.ts";

export const SUPPORTED_LOCALES = ["en-US", "de", "zh-CN"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

/** User-facing language preference, including "follow the browser". */
export const LANGUAGE_PREFERENCES = ["auto", ...SUPPORTED_LOCALES] as const;
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

/** Maps a locale code to its display name (shown in the language picker). */
export const LOCALE_LABELS: Record<AppLocale, string> = {
	"en-US": "English (US)",
	de: "Deutsch",
	"zh-CN": "中文",
};

/**
 * Resolve the best supported locale for a browser preference list (e.g.
 * `navigator.languages`). Uses `Intl.Locale` to parse/normalize BCP-47 tags:
 * exact tags win, then the base language, then English as a fallback.
 */
export function resolveAutoLocale(preferred: readonly string[]): AppLocale {
	for (const tag of preferred) {
		let locale: Intl.Locale;
		try {
			locale = new Intl.Locale(tag);
		} catch {
			continue;
		}
		if ((SUPPORTED_LOCALES as readonly string[]).includes(locale.baseName)) {
			return locale.baseName as AppLocale;
		}
		const byLanguage = SUPPORTED_LOCALES.find(
			(supported) => new Intl.Locale(supported).language === locale.language,
		);
		if (byLanguage) return byLanguage;
	}
	return "en-US";
}

export const i18n = createI18n({
	legacy: false,
	locale: "en-US",
	fallbackLocale: "en-US",
	messages: {
		"en-US": en,
		de,
		"zh-CN": zhCN,
	},
});
