import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { feeds } from "./feeds.ts";

/** Article metadata. Content HTML lives in `entry_contents`. */
export const entries = sqliteTable(
	"entries",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		feedId: integer("feed_id")
			.notNull()
			.references(() => feeds.id, { onDelete: "cascade" }),
		/** Feed-provided unique id (guid/id). */
		guid: text("guid").notNull(),
		url: text("url"),
		title: text("title").notNull(),
		author: text("author"),
		/** Plain-text preview used for list rows and search. */
		summary: text("summary"),
		/** Lead image for list rows. */
		imageUrl: text("image_url"),
		publishedAt: integer("published_at", { mode: "timestamp_ms" }),
		/** Feed-provided update time, when present. */
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
		fetchedAt: integer("fetched_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(t) => [
		uniqueIndex("entries_feed_guid_idx").on(t.feedId, t.guid),
		index("entries_feed_published_idx").on(t.feedId, t.publishedAt),
		index("entries_published_idx").on(t.publishedAt),
	],
);

/** Full content for an entry; kept separate so list queries stay light. */
export const entryContents = sqliteTable("entry_contents", {
	entryId: integer("entry_id")
		.primaryKey()
		.references(() => entries.id, { onDelete: "cascade" }),
	/** Raw HTML as published by the feed (sanitized at render time). */
	content: text("content"),
	/** Plain-text extraction used by search and previews. */
	contentText: text("content_text"),
});

export const tags = sqliteTable("tags", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull().unique(),
});

export const entryTags = sqliteTable(
	"entry_tags",
	{
		entryId: integer("entry_id")
			.notNull()
			.references(() => entries.id, { onDelete: "cascade" }),
		tagId: integer("tag_id")
			.notNull()
			.references(() => tags.id, { onDelete: "cascade" }),
	},
	(t) => [primaryKey({ columns: [t.entryId, t.tagId] }), index("entry_tags_tag_idx").on(t.tagId)],
);

/** Starred == "saved" / "read later". Presence of a row means starred. */
export const starred = sqliteTable("starred", {
	entryId: integer("entry_id")
		.primaryKey()
		.references(() => entries.id, { onDelete: "cascade" }),
	createdAt: integer("created_at", { mode: "timestamp_ms" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export const readStatus = sqliteTable("read_status", {
	entryId: integer("entry_id")
		.primaryKey()
		.references(() => entries.id, { onDelete: "cascade" }),
	isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
	readAt: integer("read_at", { mode: "timestamp_ms" }),
	archived: integer("archived", { mode: "boolean" }).notNull().default(false),
	archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
});

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type EntryContent = typeof entryContents.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type ReadStatus = typeof readStatus.$inferSelect;
