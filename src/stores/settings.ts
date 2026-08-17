import { i18n, LANGUAGE_PREFERENCES, type LanguagePreference, resolveAutoLocale } from "@/i18n";
import { api } from "@/lib/api";
import { setDayjsLocale } from "@/lib/dayjs";
import { DEFAULT_SHORTCUTS, type ShortcutAction, shortcutDisplay } from "@/lib/shortcuts";

export type ThemePreference = "light" | "dark" | "system";

export interface AiModelOption {
	key: string;
	label: string;
}

export type ShortcutBindings = Record<ShortcutAction, string[]>;

/** Desktop list column width (px). The sidebar is fixed; the reader takes the rest. */
export interface ColumnWidths {
	list: number;
}

export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = { list: 384 };

const THEME_KEY = "rss.theme";
const LOCALE_KEY = "rss.locale";
const AI_ENABLED_KEY = "rss.aiEnabled";
const AI_MODEL_KEY = "rss.aiModel";
const SHORTCUTS_KEY = "rss.shortcuts";
const COLUMN_WIDTHS_KEY = "rss.columnWidths";

const THEMES: ThemePreference[] = ["light", "dark", "system"];

function systemPrefersDark(): boolean {
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readLocal<T extends string>(key: string, fallback: T): T {
	const raw = localStorage.getItem(key);
	return raw !== null && raw.length > 0 ? (raw as T) : fallback;
}

function readLocalShortcuts(): ShortcutBindings {
	try {
		const raw = localStorage.getItem(SHORTCUTS_KEY);
		if (!raw) return structuredClone(DEFAULT_SHORTCUTS);
		const parsed = JSON.parse(raw) as Partial<ShortcutBindings>;
		const merged = structuredClone(DEFAULT_SHORTCUTS);
		for (const [action, keys] of Object.entries(parsed)) {
			if (action in merged && Array.isArray(keys) && keys.length > 0) {
				merged[action as ShortcutAction] = keys as string[];
			}
		}
		return merged;
	} catch {
		return structuredClone(DEFAULT_SHORTCUTS);
	}
}

function readLocalColumnWidths(): ColumnWidths {
	try {
		const raw = localStorage.getItem(COLUMN_WIDTHS_KEY);
		if (!raw) return { ...DEFAULT_COLUMN_WIDTHS };
		const parsed = JSON.parse(raw) as Partial<ColumnWidths>;
		return {
			list: clampWidth(parsed.list, DEFAULT_COLUMN_WIDTHS.list, 256, 512),
		};
	} catch {
		return { ...DEFAULT_COLUMN_WIDTHS };
	}
}

function clampWidth(value: unknown, fallback: number, min: number, max: number): number {
	return typeof value === "number" && Number.isFinite(value)
		? Math.min(max, Math.max(min, Math.round(value)))
		: fallback;
}

export const useSettingsStore = defineStore("settings", () => {
	const theme = ref<ThemePreference>(readLocal(THEME_KEY, "system"));
	/** User's language preference; "auto" follows the browser language. */
	const language = ref<LanguagePreference>(readLocal<LanguagePreference>(LOCALE_KEY, "auto"));
	/** Whether AI article summaries are enabled. */
	const aiEnabled = ref<boolean>(localStorage.getItem(AI_ENABLED_KEY) === "true");
	/** Key of the selected summary model (from the backend registry). */
	const aiModel = ref<string>(localStorage.getItem(AI_MODEL_KEY) ?? "");
	/** Available summary models, provided by the backend. */
	const aiModels = ref<AiModelOption[]>([]);
	/** Keyboard shortcut bindings (remappable in Settings). */
	const shortcuts = ref<ShortcutBindings>(readLocalShortcuts());
	/** Desktop column widths; the reader takes the remaining space. */
	const columnWidths = ref<ColumnWidths>(readLocalColumnWidths());
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
			setDayjsLocale(value);
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
			if (settings.shortcuts && typeof settings.shortcuts === "object") {
				shortcuts.value = mergeShortcuts(settings.shortcuts as Partial<ShortcutBindings>);
				localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts.value));
			}
			if (settings.columnWidths && typeof settings.columnWidths === "object") {
				const w = settings.columnWidths as Partial<ColumnWidths>;
				columnWidths.value = {
					list: clampWidth(w.list, columnWidths.value.list, 256, 512),
				};
				localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths.value));
			}

			// AI summary preferences come from a dedicated endpoint that also
			// carries the available model list.
			const ai = await api.get<{
				enabled: boolean;
				model: string;
				models: AiModelOption[];
			}>("/api/settings/ai");
			aiEnabled.value = ai.enabled;
			aiModel.value = ai.model;
			aiModels.value = ai.models;
			localStorage.setItem(AI_ENABLED_KEY, String(ai.enabled));
			localStorage.setItem(AI_MODEL_KEY, ai.model);
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

	async function setAiEnabled(value: boolean): Promise<void> {
		aiEnabled.value = value;
		localStorage.setItem(AI_ENABLED_KEY, String(value));
		await persist({ aiEnabled: value });
	}

	async function setAiModel(value: string): Promise<void> {
		aiModel.value = value;
		localStorage.setItem(AI_MODEL_KEY, value);
		await persist({ aiModel: value });
	}

	async function setShortcut(action: ShortcutAction, keys: string[]): Promise<void> {
		shortcuts.value = { ...shortcuts.value, [action]: keys };
		localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts.value));
		await persist({ shortcuts: shortcuts.value });
	}

	/** Update desktop column widths (local-first, backend sync best-effort). */
	async function setColumnWidths(widths: ColumnWidths): Promise<void> {
		columnWidths.value = { ...widths };
		localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths.value));
		await persist({ columnWidths: columnWidths.value });
	}

	function shortcutLabel(action: ShortcutAction): string {
		return shortcutDisplay(shortcuts.value[action] ?? []);
	}

	return {
		theme,
		language,
		aiEnabled,
		aiModel,
		aiModels,
		shortcuts,
		columnWidths,
		shortcutLabel,
		locale,
		dark,
		loaded,
		load,
		setTheme,
		setLanguage,
		setAiEnabled,
		setAiModel,
		setShortcut,
		setColumnWidths,
	};
});

/** Merge partial persisted bindings over the defaults (validates each key). */
function mergeShortcuts(partial: Partial<ShortcutBindings>): ShortcutBindings {
	const merged = structuredClone(DEFAULT_SHORTCUTS);
	for (const [action, keys] of Object.entries(partial)) {
		if (action in merged && Array.isArray(keys) && keys.length > 0) {
			merged[action as ShortcutAction] = keys as string[];
		}
	}
	return merged;
}
