import { and, eq } from "drizzle-orm";
import { type PushSubscriptionInput, pushSubscriptionSchema } from "../../shared/index.ts";
import type { Database } from "../db/index.ts";
import { pushSubscriptions } from "../db/index.ts";

/** Convert a browser `expirationTime` (ms epoch or null) to a Date or null. */
function toExpiration(expirationTime: number | null | undefined): Date | null {
	if (expirationTime == null) return null;
	return new Date(expirationTime);
}

/**
 * Upsert a PushSubscription for the given user.
 *
 * The endpoint uniquely identifies a browser subscription, so re-subscribing
 * the same device is idempotent: it updates the existing row rather than
 * creating a duplicate. A different endpoint (new browser/device/profile)
 * becomes a separate row, and all remain independently manageable.
 */
export async function upsertPushSubscription(
	db: Database,
	userId: number,
	input: PushSubscriptionInput,
): Promise<{ id: number }> {
	const parsed = pushSubscriptionSchema.parse(input);

	const existing = await db.query.pushSubscriptions.findFirst({
		where: eq(pushSubscriptions.endpoint, parsed.endpoint),
	});

	if (existing) {
		// Re-activate on re-subscribe and refresh keys/timestamps.
		const [updated] = await db
			.update(pushSubscriptions)
			.set({
				userId,
				expirationTime: toExpiration(parsed.expirationTime),
				p256dh: parsed.keys.p256dh,
				auth: parsed.keys.auth,
				active: true,
				failureCount: 0,
				updatedAt: new Date(),
			})
			.where(eq(pushSubscriptions.id, existing.id))
			.returning({ id: pushSubscriptions.id });
		// Edge case: the endpoint existed but belonged to a stale row that was
		// concurrently deleted; fall through to insert.
		if (updated) return updated;
	}

	const [created] = await db
		.insert(pushSubscriptions)
		.values({
			userId,
			endpoint: parsed.endpoint,
			expirationTime: toExpiration(parsed.expirationTime),
			p256dh: parsed.keys.p256dh,
			auth: parsed.keys.auth,
		})
		.returning({ id: pushSubscriptions.id });
	return created!;
}

/** List a user's push subscriptions (redacted — no auth/keys). */
export async function listPushSubscriptions(
	db: Database,
	userId: number,
): Promise<Array<{ id: number; endpoint: string; active: boolean; createdAt: Date }>> {
	const rows = await db
		.select({
			id: pushSubscriptions.id,
			endpoint: pushSubscriptions.endpoint,
			active: pushSubscriptions.active,
			createdAt: pushSubscriptions.createdAt,
		})
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.userId, userId))
		.orderBy(pushSubscriptions.createdAt);
	return rows;
}

/**
 * Remove a push subscription, but only if it belongs to `userId`. Returns
 * the number of rows removed (0 if it wasn't the user's subscription).
 */
export async function removePushSubscription(
	db: Database,
	userId: number,
	id: number,
): Promise<number> {
	const result = await db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, userId)))
		.run();
	return result.meta?.changes ?? 0;
}

/**
 * Remove a push subscription by endpoint (used when the browser says a
 * subscription changed/unsubscribed). Ownership is still enforced via userId.
 */
export async function removePushSubscriptionByEndpoint(
	db: Database,
	userId: number,
	endpoint: string,
): Promise<number> {
	const result = await db
		.delete(pushSubscriptions)
		.where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
		.run();
	return result.meta?.changes ?? 0;
}
