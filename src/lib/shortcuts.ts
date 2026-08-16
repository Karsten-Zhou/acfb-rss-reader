/**
 * User-configurable keyboard shortcuts. Bindings are stored per-user in the
 * backend settings (with a localStorage cache) so they can be remapped from
 * the Settings dialog. `e.key` values, e.g. "s", "a", "j", "ArrowDown".
 */

export type ShortcutAction = "moveDown" | "moveUp" | "toggleStar" | "toggleRead" | "toggleArchive";

export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = [
	"moveDown",
	"moveUp",
	"toggleStar",
	"toggleRead",
	"toggleArchive",
];

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string[]> = {
	moveDown: ["j", "ArrowDown"],
	moveUp: ["k", "ArrowUp"],
	toggleStar: ["s"],
	toggleRead: ["m"],
	toggleArchive: ["a"],
};

const DISPLAY: Record<string, string> = {
	ArrowDown: "↓",
	ArrowUp: "↑",
	" ": "Space",
};

/** Human-friendly key labels, e.g. ["j", "ArrowDown"] -> "j / ↓". */
export function shortcutDisplay(keys: readonly string[]): string {
	return keys.map((key) => DISPLAY[key] ?? key).join(" / ");
}

export function isModifierKey(key: string): boolean {
	return ["Control", "Shift", "Alt", "Meta"].includes(key);
}
