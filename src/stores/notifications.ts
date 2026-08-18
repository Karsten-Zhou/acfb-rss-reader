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
	const busy = ref<boolean>(false);
	const error = ref<string | null>(null);

	const status = computed<PushStatus>(() => describePushState(permission.value, subscribed.value));

	/** Load the backend capability surface (VAPID key + server config). */
	async function loadCapability(): Promise<void> {
		try {
			const cap = await api.get<PushCapability>("/api/push/capability");
			configured.value = cap.configured;
			publicKey.value = cap.publicKey;
		} catch {
			configured.value = false;
			publicKey.value = null;
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
	 * subscription is updated. Never requests permission here.
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
					// Non-fatal: the subscription will be reconciled next time.
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
		busy.value = true;
		error.value = null;
		try {
			const perm = await requestNotificationPermission();
			permission.value = perm;
			if (perm !== "granted") {
				if (perm === "denied") error.value = "permission-denied";
				return false;
			}

			const registered = await registerServiceWorker();
			if (!registered) {
				error.value = "sw-failed";
				return false;
			}

			// Obtain VAPID public key from the backend.
			if (!configured.value || !publicKey.value) {
				await loadCapability();
			}
			if (!publicKey.value) {
				error.value = "not-configured";
				return false;
			}

			const sub = await subscribeToPush(publicKey.value);
			if (!sub) {
				error.value = "subscribe-failed";
				return false;
			}

			const body = toSubscriptionInput(sub);
			const { id } = await api.put<{ ok: boolean; id: number }>("/api/push/subscription", body);
			subscriptionId.value = id;
			subscribed.value = true;
			return true;
		} catch {
			error.value = "sync-failed";
			return false;
		} finally {
			busy.value = false;
		}
	}

	/**
	 * Disable on the current device: unsubscribe from the browser and remove
	 * the server-side subscription. The global preference is left untouched
	 * (it applies to all devices).
	 */
	async function disable(): Promise<void> {
		busy.value = true;
		error.value = null;
		try {
			const sub = await getBrowserSubscription();
			if (subscriptionId.value !== null) {
				try {
					await api.delete(`/api/push/subscription/${subscriptionId.value}`);
				} catch {
					// 404 means it's already gone; ignore.
				}
				subscriptionId.value = null;
			} else if (sub) {
				// No known id but a browser subscription exists — remove by endpoint.
				try {
					await api.post("/api/push/subscription/remove", {
						endpoint: sub.endpoint,
					});
				} catch {
					// ignore
				}
			}
			await unsubscribeFromPush();
			subscribed.value = false;
		} finally {
			busy.value = false;
		}
	}

	/** Toggle the global on/off preference (persisted to the backend). */
	async function setEnabled(value: boolean): Promise<void> {
		enabled.value = value;
		localStorage.setItem(NOTIFICATION_ENABLED_KEY, String(value));
		try {
			await api.put<{ ok: boolean }>("/api/settings", { notificationEnabled: value });
		} catch {
			// Backend sync is best-effort (consistent with the settings store).
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
