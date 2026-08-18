import { i18n } from "@/i18n";

/**
 * Lightweight toast notifications.
 *
 * A minimal, Pinia-backed toast host with no external dependency. Used to
 * surface non-blocking feedback (especially failures) for async actions that
 * would otherwise fail silently (e.g. star/archive mutations, subscription
 * sync). Auto-dismisses; can be dismissed manually. Mounted once via
 * `ToastHost.vue` in the root app.
 *
 * `message` and `description` are i18n keys resolved at push time against the
 * current locale.
 */

export type ToastKind = "success" | "error";

export interface ToastItem {
	id: number;
	kind: ToastKind;
	message: string;
	description?: string;
}

const AUTO_DISMISS_MS = 5000;
let nextId = 0;

function translate(key: string): string {
	if (i18n.global.te(key)) return i18n.global.t(key);
	return key;
}

export const useToastStore = defineStore("toast", () => {
	const items = ref<ToastItem[]>([]);
	const timers = new Map<number, ReturnType<typeof setTimeout>>();

	function dismiss(id: number): void {
		const timer = timers.get(id);
		if (timer) {
			clearTimeout(timer);
			timers.delete(id);
		}
		items.value = items.value.filter((item) => item.id !== id);
	}

	/** Show a toast; returns its id so callers can dismiss programmatically. */
	function push(kind: ToastKind, message: string, description?: string): number {
		const id = ++nextId;
		items.value.push({
			id,
			kind,
			message: translate(message),
			description: description ? translate(description) : undefined,
		});
		const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
		timers.set(id, timer);
		return id;
	}

	function success(message: string, description?: string): number {
		return push("success", message, description);
	}

	function error(message: string, description?: string): number {
		return push("error", message, description);
	}

	return { items, push, success, error, dismiss };
});
