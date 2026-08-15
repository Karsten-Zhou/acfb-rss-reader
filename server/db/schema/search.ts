import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * FTS5 full-text search index over entries.
 *
 * The real table is created as a virtual table in migration 0000 via raw SQL
 * (`CREATE VIRTUAL TABLE entries_fts USING fts5(...)`). We declare it here as
 * a plain table so Drizzle can type-check inserts/updates against it. It is
 * recorded in the drizzle-kit snapshot so it is never regenerated.
 *
 * Columns mirror the fts5 definition (with `entry_id UNINDEXED`).
 */
export const entriesFts = sqliteTable("entries_fts", {
	entryId: integer("entry_id"),
	title: text("title"),
	content: text("content"),
	author: text("author"),
	feedTitle: text("feed_title"),
	tags: text("tags"),
});

export type EntriesFts = typeof entriesFts.$inferSelect;
