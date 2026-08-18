/**
 * RSS Reader — service worker.
 *
 * Scope: root (`/sw.js`), so it handles the whole app and can receive Push
 * events. It stays deliberately small: it only renders native notifications
 * from the (encrypted) push payload and handles notification clicks. No
 * application business logic or state lives here.
 *
 * The push payload is produced server-side (`server/notifications/service.ts`)
 * and delivered via Web Push. Content is always plain text — never HTML.
 */

/** Icon shown on notifications. Falls back to "any" SVG favicon. */
const ICON = "/favicon.svg";
const BADGE = "/favicon.svg";

/**
 * Parse the structured notification payload sent in the push message.
 * Returns null when the payload is missing/malformed so we never crash or
 * render garbage from untrusted article content.
 */
function readPayload(event) {
	try {
		const data = event.data ? event.data.json() : null;
		if (!data || typeof data !== "object") return null;
		if (typeof data.title !== "string" || typeof data.body !== "string") return null;
		return data;
	} catch {
		return null;
	}
}

self.addEventListener("push", (event) => {
	const payload = readPayload(event);
	if (!payload) {
		// No usable payload — nothing to show. (Consider `registration.showNotification`
		// with generic text here if you ever send data-less pushes.)
		return;
	}

	// `requireInteraction` is not set: banners auto-dismiss, matching a
	// lightweight "new article" notification. `tag` lets the push service
	// coalesce rapid-fire entries and replace an existing visible notification
	// for the same article instead of stacking duplicates.
	event.waitUntil(
		self.registration.showNotification(payload.title, {
			body: payload.body,
			icon: ICON,
			badge: BADGE,
			tag: typeof payload.tag === "string" ? payload.tag : undefined,
			// Keep the app's data for the click handler.
			data: {
				url: typeof payload.url === "string" ? payload.url : "/",
				entryId: payload.entryId ?? null,
				feedId: payload.feedId ?? null,
			},
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();

	const targetUrl = event.notification?.data?.url ?? "/";
	const url = new URL(targetUrl, self.location.origin);

	event.waitUntil(
		(async () => {
			// If a window of the app is already open, focus it (and navigate to
			// the article) instead of opening a duplicate.
			const windowClients = await self.clients.matchAll({
				type: "window",
				includeUncontrolled: true,
			});
			for (const client of windowClients) {
				try {
					await client.focus();
					await client.navigate(url.toString());
					return;
				} catch {
					// Client isn't controllable (e.g. a cross-origin tab); fall
					// through to opening a fresh window.
				}
			}
			// No usable open window — open the app at the target route.
			await self.clients.openWindow(url.toString());
		})(),
	);
});
