import { z } from "zod";

/**
 * A browser `PushSubscription`, as produced by `JSON.stringify()` on the
 * `PushSubscription` object. The endpoint is a push-service capability URL —
 * knowledge of it is all that is needed to deliver pushes, so it is treated
 * as sensitive data. `keys.p256dh` and `keys.auth` are the URL-safe base64
 * P-256 public key and auth secret used to encrypt payloads.
 */
export const pushSubscriptionSchema = z.object({
	endpoint: z.string().url().max(2048),
	expirationTime: z.coerce.number().int().nonnegative().nullable().optional(),
	keys: z.object({
		p256dh: z.string().min(1).max(1024),
		auth: z.string().min(1).max(1024),
	}),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/**
 * The structured notification payload sent to the service worker in the
 * (encrypted) push body. Kept deliberately small — never the article body.
 */
export interface PushNotificationPayload {
	type: "new-feed-entry";
	title: string;
	body: string;
	tag: string;
	url: string;
	entryId: number;
	feedId: number;
}

/** Notification types currently supported by the delivery ledger. */
export const NOTIFICATION_TYPES = ["new-feed-entry"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
