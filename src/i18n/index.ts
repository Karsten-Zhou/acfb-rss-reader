import { match } from "@formatjs/intl-localematcher";
import de from "./locales/de.ts";
import en from "./locales/en.ts";
import zhCN from "./locales/zh-CN.ts";

export const SUPPORTED_LOCALES = ["en", "de", "zh-CN"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

/** User-facing language preference, including "follow the browser". */
export const LANGUAGE_PREFERENCES = ["auto", ...SUPPORTED_LOCALES] as const;
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

/**
 * Resolve the best supported locale for a browser preference list (e.g.
 * `navigator.languages`). Uses `Intl.Locale` to parse/normalize BCP-47 tags:
 * exact tags win, then the base language, then English as a fallback.
 */
export function resolveAutoLocale(): AppLocale {
	return match(navigator.languages, SUPPORTED_LOCALES, "en") as AppLocale;
}

export const i18n = createI18n({
	legacy: false,
	locale: "en",
	fallbackLocale: "en",
	messages: {
		en: en,
		de: de,
		"zh-CN": zhCN,
	},
});
