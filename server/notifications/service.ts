import { and, eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import type { PushNotificationPayload } from "../../shared/index.ts";
import { type Database, notificationDeliveries, pushSubscriptions } from "../db/index.ts";
import { logger } from "../logging.ts";
import type { Env } from "../types.ts";

import { configureWebPush, getVapidConfig } from "./vapid.ts";

/** Number of consecutive failures before a subscription is auto-deactivated. */
const MAX_FAILURES_BEFORE_DEACTIVATE = 3;

/** A genuinely new entry that the pipeline decided should be notified. */
export interface NewEntryNotification {
	entryId: number;
	title: string;
	url: string | null;
	feedId: number;
	feedTitle: string;
}

interface PushErrorLike {
	statusCode?: number;
	message?: string;
}

function toPushError(err: unknown): PushErrorLike {
	if (err && typeof err === "object") {
		const e = err as PushErrorLike;
		return { statusCode: e.statusCode, message: e.message };
	}
	return { message: String(err) };
}

/**
 * Build the compact payload sent to the service worker. Article content is
 * never included — only enough to identify and open the article.
 */
export function buildPayload(n: NewEntryNotification): PushNotificationPayload {
	return {
		type: "new-feed-entry",
		title: n.feedTitle,
		body: n.title,
		tag: `feed-entry:${n.entryId}`,
		url: `/reader/${n.entryId}`,
		entryId: n.entryId,
		feedId: n.feedId,
	};
}

/**
 * Send one notification to a single subscription via web-push. Returns
 * "ok" | "expired" | "error". `expired` means the push service reports the
 * endpoint is gone/invalid (404/410) and the subscription should be removed.
 */
async function sendToOne(
	webpushImport: typeof webpush,
	sub: { id: number; endpoint: string; p256dh: string; auth: string },
	payload: PushNotificationPayload,
): Promise<"ok" | "expired" | "error"> {
	try {
		await webpushImport.sendNotification(
			{
				endpoint: sub.endpoint,
				keys: { p256dh: sub.p256dh, auth: sub.auth },
			},
			JSON.stringify(payload),
			{
				contentEncoding: "aes128gcm",
				// 24h TTL: push services drop stale messages after this.
				TTL: 24 * 60 * 60,
				urgency: "high",
			},
		);
		return "ok";
	} catch (err) {
		const { statusCode } = toPushError(err);
		if (statusCode === 404 || statusCode === 410) return "expired";
		return "error";
	}
}

/** Record a delivery failure against a single subscription (read-modify-write). */
async function recordFailure(db: Database, id: number): Promise<void> {
	const row = await db.query.pushSubscriptions.findFirst({ where: eq(pushSubscriptions.id, id) });
	if (!row) return;
	const failureCount = row.failureCount + 1;
	await db
		.update(pushSubscriptions)
		.set({
			failureCount,
			lastFailureAt: new Date(),
			// Deactivate permanently-invalid endpoints after repeated failures.
			active: failureCount >= MAX_FAILURES_BEFORE_DEACTIVATE ? false : row.active,
			updatedAt: new Date(),
		})
		.where(eq(pushSubscriptions.id, id));
}

/**
 * Deliver a single new-article notification.
 *
 * Idempotency: the delivery row is claimed atomically with
 * `INSERT … ON CONFLICT DO NOTHING`. If it already exists, we've already
 * processed this entry, so nothing is re-sent — even across Worker restarts,
 * Workflow retries or repeated feed refreshes.
 *
 * Returns true when the entry was processed (already-delivered counts as
 * processed). Returns false only when Web Push is not configured (so callers
 * can skip without erroring).
 */
export async function notifyNewEntry(
	db: Database,
	env: Env,
	n: NewEntryNotification,
): Promise<boolean> {
	// No VAPID credentials -> nothing we can send. Quietly skip and never
	// fail the feed pipeline (e.g. local dev before keys are configured).
	if (!getVapidConfig(env)) {
		logger.info("Push: VAPID not configured, skipping notification");
		return false;
	}
	configureWebPush(env);

	// Per-device opt-in: only devices with an active subscription receive
	// notifications, so fetch them first and bail out early when no device
	// has enabled notifications.
	const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.active, true));
	if (subs.length === 0) return false;

	// Claim the idempotency row.
	const claim = await db
		.insert(notificationDeliveries)
		.values({ entryId: n.entryId, notificationType: "new-feed-entry" })
		.onConflictDoNothing()
		.run();
	if ((claim.meta?.changes ?? 0) === 0) {
		logger.info("Push: already notified entry", { entryId: n.entryId });
		return true;
	}

	const payload = buildPayload(n);
	let sent = 0;
	let expired = 0;
	for (const sub of subs) {
		const outcome = await sendToOne(webpush, sub, payload);
		if (outcome === "ok") {
			sent += 1;
			await db
				.update(pushSubscriptions)
				.set({
					failureCount: 0,
					lastDeliveredAt: new Date(),
					active: true,
					updatedAt: new Date(),
				})
				.where(eq(pushSubscriptions.id, sub.id));
		} else if (outcome === "expired") {
			expired += 1;
			// The push service says this endpoint is gone — deactivate it and
			// keep delivering to the remaining subscriptions.
			await db
				.update(pushSubscriptions)
				.set({ active: false, failureCount: 0, updatedAt: new Date() })
				.where(eq(pushSubscriptions.id, sub.id));
			logger.info("Push: deactivated dead subscription", { id: sub.id });
		} else {
			await recordFailure(db, sub.id);
		}
	}

	// Mark processed (bookkeeping). The row already gates future sends.
	await db
		.update(notificationDeliveries)
		.set({ status: "sent", deliveredAt: new Date(), targetCount: subs.length })
		.where(
			and(
				eq(notificationDeliveries.entryId, n.entryId),
				eq(notificationDeliveries.notificationType, "new-feed-entry"),
			),
		);

	logger.info("Push: delivered notification", {
		entryId: n.entryId,
		sent,
		expired,
		subs: subs.length,
	});
	return true;
}

/** Remove inactive subscriptions (housekeeping). Returns count removed. */
export async function cleanupInactiveSubscriptions(db: Database): Promise<number> {
	const rows = await db
		.select({ id: pushSubscriptions.id })
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.active, false))
		.all();
	if (rows.length === 0) return 0;
	await db.delete(pushSubscriptions).where(
		inArray(
			pushSubscriptions.id,
			rows.map((r) => r.id),
		),
	);
	return rows.length;
}
