import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** The single allowed GitHub account. */
export const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	/** GitHub numeric user id. */
	githubId: integer("github_id").notNull().unique(),
	githubLogin: text("github_login").notNull(),
	name: text("name"),
	avatarUrl: text("avatar_url"),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.$defaultFn(() => new Date()),
});

/** Authentication sessions. The token itself is only known to the client. */
export const sessions = sqliteTable("sessions", {
	/** SHA-256 hex of the opaque session token. */
	tokenHash: text("token_hash").primaryKey(),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.$defaultFn(() => new Date()),
	expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
	/** Updated on activity to support a sliding expiry window. */
	lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
