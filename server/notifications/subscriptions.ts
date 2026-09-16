import { eq } from "drizzle-orm";
import { type PushSubscriptionInput, pushSubscriptionSchema } from "../../shared/index.ts";
import type { Database } from "../db/index.ts";
import { pushSubscriptions } from "../db/index.ts";

/** Convert a browser `expirationTime` (ms epoch or null) to a Date or null. */
function toExpiration(expirationTime: number | null | undefined): Date | null {
	if (expirationTime == null) return null;
	return new Date(expirationTime);
}

/**
 * Upsert a PushSubscription for the reader.
 *
 * The endpoint uniquely identifies a browser subscription, so re-subscribing
 * the same device is idempotent: it updates the existing row rather than
 * creating a duplicate. A different endpoint (new browser/device/profile)
 * becomes a separate row, and all remain independently manageable.
 */
export async function upsertPushSubscription(
	db: Database,
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
			endpoint: parsed.endpoint,
			expirationTime: toExpiration(parsed.expirationTime),
			p256dh: parsed.keys.p256dh,
			auth: parsed.keys.auth,
		})
		.returning({ id: pushSubscriptions.id });
	return created!;
}

/** List the registered push subscriptions (endpoint + status, no encryption keys). */
export async function listPushSubscriptions(
	db: Database,
): Promise<Array<{ id: number; endpoint: string; active: boolean; createdAt: Date }>> {
	const rows = await db
		.select({
			id: pushSubscriptions.id,
			endpoint: pushSubscriptions.endpoint,
			active: pushSubscriptions.active,
			createdAt: pushSubscriptions.createdAt,
		})
		.from(pushSubscriptions)
		.orderBy(pushSubscriptions.createdAt);
	return rows;
}

/** Remove a push subscription by id. Returns the number of rows removed. */
export async function removePushSubscription(db: Database, id: number): Promise<number> {
	const result = await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id)).run();
	return result.meta?.changes ?? 0;
}

/**
 * Remove a push subscription by endpoint (used when the browser says a
 * subscription changed/unsubscribed).
 */
export async function removePushSubscriptionByEndpoint(
	db: Database,
	endpoint: string,
): Promise<number> {
	const result = await db
		.delete(pushSubscriptions)
		.where(eq(pushSubscriptions.endpoint, endpoint))
		.run();
	return result.meta?.changes ?? 0;
}
