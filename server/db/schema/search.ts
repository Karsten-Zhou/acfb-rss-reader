import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * FTS5 full-text search index over entries.
 *
 * The real table is created as a virtual table in the init migration via raw
 * SQL (`CREATE VIRTUAL TABLE entries_fts USING fts5(...)`). We declare it here
 * as a plain table so Drizzle can type-check inserts/updates against it. It is
 * recorded in the drizzle-kit snapshot so `db:generate` never tries to recreate
 * it as a normal table (drizzle-kit emits a plain `CREATE TABLE` for it, which
 * the init migration overrides with the FTS5 virtual-table form).
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
