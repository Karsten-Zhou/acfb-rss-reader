import { api } from "@/lib/api";
import {
	browserSupportsPush,
	describePushState,
	getBrowserSubscription,
	getNotificationPermission,
	type PushStatus,
	registerServiceWorker,
	requestNotificationPermission,
	subscribeToPush,
	toSubscriptionInput,
	unsubscribeFromPush,
} from "@/lib/pushNotifications";
import { useToastStore } from "@/stores/toast";

export interface PushCapability {
	configured: boolean;
	enabled: boolean;
	publicKey: string | null;
	subscriptions: Array<{ id: number; endpoint: string; active: boolean; createdAt: string }>;
}

const NOTIFICATION_ENABLED_KEY = "rss.notificationEnabled";

/**
 * Pinia store managing the browser push-notification subscription lifecycle:
 * permission, service-worker registration, server-side persistence, and the
 * global on/off preference.
 *
 * The global preference (`notificationEnabled`) is both persisted to the
 * backend (`settings`) and cached locally, so the state is known even on the
 * login screen / offline. The browser-level subscription is a separate,
 * per-device concern handled by the Push API.
 *
 * Loading: every operation (subscribe/unsubscribe/toggle) may wait on a long
 * network roundtrip (permission prompt, VAPID fetch, D1 persistence), so each
 * exposes a `busy` state that disables the toggle/buttons, and use a
 * per-operation `loading` enum where the UI needs to distinguish. Failures are
 * surfaced as toasts (they were previously best-effort/silent).
 */
export const useNotificationsStore = defineStore("notifications", () => {
	const supported = ref<boolean>(false);
	const permission = ref<"default" | "granted" | "denied" | "unsupported">("default");
	const subscribed = ref<boolean>(false);
	/** Server-side subscription id for the current device, if persisted. */
	const subscriptionId = ref<number | null>(null);
	const configured = ref<boolean>(false);
	const enabled = ref<boolean>(localStorage.getItem(NOTIFICATION_ENABLED_KEY) === "true");
	const publicKey = ref<string | null>(null);

	/** One of "idle" | "subscribe" | "unsubscribe" | "toggle" — what is running. */
	const loading = ref<"idle" | "subscribe" | "unsubscribe" | "toggle">("idle");
	/** Last error code (maps to an i18n message + toast). */
	const error = ref<string | null>(null);

	const busy = computed(() => loading.value !== "idle");

	const status = computed<PushStatus>(() => describePushState(permission.value, subscribed.value));

	function toastError(code: string): void {
		error.value = code;
		// Never show raw exceptions; map to a human message. `code` is a key
		// under `notification.errors.*` resolved to localized text.
		useToastStore().error("notification.errorTitle", `notification.errors.${code}`);
	}

	/** Load the backend capability surface (VAPID key + server config). */
	async function loadCapability(): Promise<void> {
		try {
			const cap = await api.get<PushCapability>("/api/push/capability");
			configured.value = cap.configured;
			publicKey.value = cap.publicKey;
		} catch {
			configured.value = false;
			publicKey.value = null;
			toastError("load-capability-failed");
		}
	}

	/** Refresh browser-level push state (permission + current subscription). */
	async function refreshBrowserState(): Promise<void> {
		supported.value = browserSupportsPush();
		if (!supported.value) {
			permission.value = "unsupported";
			subscribed.value = false;
			return;
		}
		permission.value = getNotificationPermission();
		const sub = await getBrowserSubscription();
		subscribed.value = sub !== null;
	}

	/**
	 * Initialise on app start / settings open. Reconciles the browser's
	 * current subscription with the backend so a stale or changed
	 * subscription is updated. Never requests permission here. Silent on
	 * failure (non-fatal; retried next time) — but it does not flash a toast
	 * on every page load.
	 */
	async function init(): Promise<void> {
		await refreshBrowserState();
		await loadCapability();

		// Recovery (Task 13): if we're subscribed in the browser but the server
		// doesn't know the current subscription (e.g. it changed since last
		// visit), re-persist it.
		if (supported.value && permission.value === "granted" && subscribed.value) {
			const sub = await getBrowserSubscription();
			if (sub && configured.value && publicKey.value) {
				try {
					const { id } = await api.put<{ ok: boolean; id: number }>("/api/push/subscription", {
						...toSubscriptionInput(sub),
					});
					subscriptionId.value = id;
				} catch {
					// Non-fatal: reconciled next time.
				}
			}
		}
	}

	/** Drop local + persisted subscription state without prompting. */
	async function resetLocalState(): Promise<void> {
		subscribed.value = false;
		subscriptionId.value = null;
	}

	/**
	 * Subscribe on the current device: request permission (user gesture),
	 * register the service worker, obtain the VAPID key, create the browser
	 * subscription, and persist it server-side. Returns true on success.
	 */
	async function enable(): Promise<boolean> {
		if (!supported.value) return false;
		if (busy.value) return false;
		loading.value = "subscribe";
		error.value = null;
		try {
			const perm = await requestNotificationPermission();
			permission.value = perm;
			if (perm !== "granted") {
				if (perm === "denied") {
					useToastStore().error(
						"notification.permissionDeniedTitle",
						"notification.permissionDeniedBody",
					);
				}
				return false;
			}

			const registered = await registerServiceWorker();
			if (!registered) {
				toastError("sw-failed");
				return false;
			}

			// Obtain VAPID public key from the backend.
			if (!configured.value || !publicKey.value) {
				await loadCapability();
			}
			if (!publicKey.value) {
				toastError("not-configured");
				return false;
			}

			const sub = await subscribeToPush(publicKey.value);
			if (!sub) {
				toastError("subscribe-failed");
				return false;
			}

			const body = toSubscriptionInput(sub);
			const { id } = await api.put<{ ok: boolean; id: number }>("/api/push/subscription", body);
			subscriptionId.value = id;
			subscribed.value = true;
			useToastStore().success("notification.successTitle", "notification.successBody");
			return true;
		} catch {
			toastError("sync-failed");
			return false;
		} finally {
			loading.value = "idle";
		}
	}

	/**
	 * Disable on the current device: unsubscribe from the browser and remove
	 * the server-side subscription. The global preference is left untouched
	 * (it applies to all devices).
	 */
	async function disable(): Promise<void> {
		if (busy.value) return;
		loading.value = "unsubscribe";
		error.value = null;
		try {
			const sub = await getBrowserSubscription();
			if (subscriptionId.value !== null) {
				try {
					await api.delete(`/api/push/subscription/${subscriptionId.value}`);
				} catch (err) {
					// 404 means it's already gone; anything else is a real failure.
					const status = (err as { status?: number } | null)?.status;
					if (status !== 404) {
						useToastStore().error(
							"notification.removeFailedTitle",
							"notification.removeFailedBody",
						);
					}
				}
				subscriptionId.value = null;
			} else if (sub) {
				try {
					await api.post("/api/push/subscription/remove", {
						endpoint: sub.endpoint,
					});
				} catch {
					useToastStore().error("notification.removeFailedTitle", "notification.removeFailedBody");
				}
			}
			await unsubscribeFromPush();
			subscribed.value = false;
		} finally {
			loading.value = "idle";
		}
	}

	/**
	 * Toggle the global on/off preference (persisted to the backend). Returns
	 * true on success; surfaces failures as a toast. This can take a long
	 * roundtrip, so `loading` is set to "toggle" and `enabled` only flips on
	 * success (rolls back on failure).
	 */
	async function setEnabled(value: boolean): Promise<boolean> {
		if (busy.value) return false;
		const previous = enabled.value;
		loading.value = "toggle";
		error.value = null;
		try {
			await api.put<{ ok: boolean }>("/api/settings", { notificationEnabled: value });
			enabled.value = value;
			localStorage.setItem(NOTIFICATION_ENABLED_KEY, String(value));
			return true;
		} catch {
			enabled.value = previous;
			error.value = "sync-failed";
			useToastStore().error("notification.settingsFailedTitle", "notification.settingsFailedBody");
			return false;
		} finally {
			loading.value = "idle";
		}
	}

	return {
		supported,
		permission,
		subscribed,
		subscriptionId,
		configured,
		enabled,
		publicKey,
		busy,
		loading,
		error,
		status,
		init,
		enable,
		disable,
		setEnabled,
		refreshBrowserState,
		resetLocalState,
	};
});
