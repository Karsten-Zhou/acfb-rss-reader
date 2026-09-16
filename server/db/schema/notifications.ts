import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { entries } from "./entries.ts";

/**
 * Web Push subscriptions.
 *
 * Every browser/device that opts in holds one active subscription (desktop
 * Chrome, Android Chrome, Firefox, …). Each maps to one browser
 * `PushSubscription`. The `endpoint` is the push-service capability URL and
 * must be treated as sensitive data (it is the only thing needed to deliver a
 * push).
 */
export const pushSubscriptions = sqliteTable("push_subscriptions", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	/** Push-service endpoint (capability URL). Unique per device. */
	endpoint: text("endpoint").notNull().unique(),
	/** `PushSubscription.expirationTime` (ms epoch) or NULL if none. */
	expirationTime: integer("expiration_time", { mode: "timestamp_ms" }),
	/** P-256 public encryption key (URL-safe base64). */
	p256dh: text("p256dh").notNull(),
	/** Auth secret (URL-safe base64). */
	auth: text("auth").notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.notNull()
		.$defaultFn(() => new Date()),
	/** Last time a delivery to this subscription succeeded. */
	lastDeliveredAt: integer("last_delivered_at", { mode: "timestamp_ms" }),
	/** Last time a delivery to this subscription failed. */
	lastFailureAt: integer("last_failure_at", { mode: "timestamp_ms" }),
	/** Consecutive failure count (used to deactivate dead endpoints). */
	failureCount: integer("failure_count").notNull().default(0),
	/** Deactivated when the push service reports the endpoint invalid. */
	active: integer("active", { mode: "boolean" }).notNull().default(true),
});

/**
 * Idempotent notification-delivery ledger.
 *
 * A single row per (entry, notificationType). Its existence — claimed atomically
 * with `INSERT … ON CONFLICT DO NOTHING` — is what guarantees a retry of a feed
 * refresh (or a Workflow retry) never sends the same notification twice. It is a
 * lightweight key into the `entries` table; the full article record is NOT
 * duplicated here.
 */
export const notificationDeliveries = sqliteTable(
	"notification_deliveries",
	{
		entryId: integer("entry_id")
			.notNull()
			.references(() => entries.id, { onDelete: "cascade" }),
		/** Notification kind, currently only "new-feed-entry". */
		notificationType: text("notification_type").notNull().default("new-feed-entry"),
		status: text("status", { enum: ["sending", "sent", "failed"] })
			.notNull()
			.default("sending"),
		createdAt: integer("created_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
		deliveredAt: integer("delivered_at", { mode: "timestamp_ms" }),
		/** Number of active subscriptions we attempted to reach. */
		targetCount: integer("target_count").notNull().default(0),
	},
	(t) => [
		primaryKey({ columns: [t.entryId, t.notificationType] }),
		index("notification_deliveries_type_idx").on(t.notificationType),
	],
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
