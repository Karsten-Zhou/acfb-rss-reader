import { useEventListener } from "@vueuse/core";

function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export interface KeyboardShortcut {
	/** Key(s) that trigger the action; `e.key` values. */
	keys: string[];
	/** True when Ctrl/Cmd must be held. */
	withModifier?: boolean;
	handler: () => void;
	/** Skip default browser behavior (e.g. for `j`/`k`). */
	preventDefault?: boolean;
}

/**
 * Register Gmail/Inoreader-style keyboard shortcuts. Accepts a function so the
 * bindings stay reactive (e.g. when the user remaps them in Settings) — the
 * handler reads the current list on every keydown.
 */
export function useKeyboardShortcuts(shortcuts: () => KeyboardShortcut[]): void {
	useEventListener(window, "keydown", (event) => {
		if (isTypingTarget(event.target)) return;

		const shortcut = shortcuts().find((s) => {
			if (!s.keys.includes(event.key)) return false;
			if (s.withModifier) return event.ctrlKey || event.metaKey;
			return !event.ctrlKey && !event.metaKey && !event.altKey;
		});
		if (!shortcut) return;
		if (shortcut.preventDefault) event.preventDefault();
		shortcut.handler();
	});
}
