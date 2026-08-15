import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

import { i18n, LANGUAGE_PREFERENCES, type LanguagePreference, resolveAutoLocale } from "@/i18n";
import { api } from "@/lib/api";

export type ThemePreference = "light" | "dark" | "system";

const THEME_KEY = "rss.theme";
const LOCALE_KEY = "rss.locale";

const THEMES: ThemePreference[] = ["light", "dark", "system"];

function systemPrefersDark(): boolean {
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readLocal<T extends string>(key: string, fallback: T): T {
	const raw = localStorage.getItem(key);
	return raw !== null && raw.length > 0 ? (raw as T) : fallback;
}

export const useSettingsStore = defineStore("settings", () => {
	const theme = ref<ThemePreference>(readLocal(THEME_KEY, "system"));
	/** User's language preference; "auto" follows the browser language. */
	const language = ref<LanguagePreference>(readLocal<LanguagePreference>(LOCALE_KEY, "auto"));
	const loaded = ref(false);

	/** Effective locale after resolving the "auto" preference. */
	const locale = computed(() =>
		language.value === "auto" ? resolveAutoLocale(navigator.languages) : language.value,
	);

	const dark = computed(
		() => theme.value === "dark" || (theme.value === "system" && systemPrefersDark()),
	);

	function applyTheme(): void {
		document.documentElement.classList.toggle("dark", dark.value);
	}

	watch(theme, applyTheme, { immediate: true });
	watch(
		locale,
		(value) => {
			i18n.global.locale.value = value;
			document.documentElement.lang = value;
		},
		{ immediate: true },
	);

	// Follow OS scheme changes while in "system" mode.
	const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
	schemeQuery.addEventListener("change", () => {
		if (theme.value === "system") applyTheme();
	});

	/** Load persisted settings from the backend (cached locally as a fallback). */
	async function load(): Promise<void> {
		try {
			const { settings } = await api.get<{ settings: Record<string, unknown> }>("/api/settings");
			if (typeof settings.theme === "string" && (THEMES as string[]).includes(settings.theme)) {
				theme.value = settings.theme as ThemePreference;
				localStorage.setItem(THEME_KEY, settings.theme);
			}
			if (
				typeof settings.locale === "string" &&
				(LANGUAGE_PREFERENCES as readonly string[]).includes(settings.locale)
			) {
				language.value = settings.locale as LanguagePreference;
				localStorage.setItem(LOCALE_KEY, settings.locale);
			}
		} catch {
			// Not signed in or offline — keep the cached preference.
		} finally {
			loaded.value = true;
		}
	}

	async function persist(patch: Record<string, unknown>): Promise<void> {
		try {
			await api.put<{ ok: boolean }>("/api/settings", patch);
		} catch {
			// Locally cached; backend sync is best-effort (e.g. on the login page).
		}
	}

	async function setTheme(value: ThemePreference): Promise<void> {
		theme.value = value;
		localStorage.setItem(THEME_KEY, value);
		await persist({ theme: value });
	}

	async function setLanguage(value: LanguagePreference): Promise<void> {
		language.value = value;
		localStorage.setItem(LOCALE_KEY, value);
		await persist({ locale: value });
	}

	return { theme, language, locale, dark, loaded, load, setTheme, setLanguage };
});
