import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Subscription folders (e.g. "Tech", "Gaming"). */
export const feedFolders = sqliteTable("feed_folders", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	/** Sort order within the sidebar. */
	position: integer("position").notNull().default(0),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export const feeds = sqliteTable(
	"feeds",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		/** Canonical feed URL. */
		url: text("url").notNull().unique(),
		/** The site the feed belongs to, if different from the feed URL. */
		siteUrl: text("site_url"),
		title: text("title").notNull(),
		description: text("description"),
		type: text("type", { enum: ["rss", "atom", "json"] })
			.notNull()
			.default("rss"),
		faviconUrl: text("favicon_url"),
		folderId: integer("folder_id").references(() => feedFolders.id, {
			onDelete: "set null",
		}),
		/** Sidebar sort order. */
		position: integer("position").notNull().default(0),
		/** Conditional request headers from the last successful fetch. */
		etag: text("etag"),
		lastModified: text("last_modified"),
		lastFetchedAt: integer("last_fetched_at", { mode: "timestamp_ms" }),
		nextFetchAt: integer("next_fetch_at", { mode: "timestamp_ms" }),
		status: text("status", { enum: ["ok", "broken", "paused"] })
			.notNull()
			.default("ok"),
		errorCount: integer("error_count").notNull().default(0),
		lastError: text("last_error"),
		addedAt: integer("added_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(t) => [index("feeds_folder_idx").on(t.folderId), index("feeds_status_idx").on(t.status)],
);

export type FeedFolder = typeof feedFolders.$inferSelect;
export type Feed = typeof feeds.$inferSelect;
export type NewFeed = typeof feeds.$inferInsert;
