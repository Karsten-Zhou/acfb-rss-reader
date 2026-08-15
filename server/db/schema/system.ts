import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { feeds } from "./feeds.ts";

/** Background job bookkeeping (feed refresh, OPML import, cleanup). */
export const refreshJobs = sqliteTable("refresh_jobs", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	type: text("type", { enum: ["feed", "opml_import", "cleanup"] }).notNull(),
	status: text("status", {
		enum: ["pending", "running", "completed", "failed"],
	})
		.notNull()
		.default("pending"),
	startedAt: integer("started_at", { mode: "timestamp_ms" }),
	finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
	error: text("error"),
	/** JSON stats blob, e.g. {"feeds": 12, "newEntries": 34}. */
	stats: text("stats"),
});

/** One fetch attempt per feed — powers the feed diagnostics page. */
export const fetchLogs = sqliteTable(
	"fetch_logs",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		feedId: integer("feed_id")
			.notNull()
			.references(() => feeds.id, { onDelete: "cascade" }),
		fetchedAt: integer("fetched_at", { mode: "timestamp_ms" })
			.notNull()
			.$defaultFn(() => new Date()),
		status: text("status", {
			enum: ["success", "not_modified", "error", "timeout"],
		}).notNull(),
		httpStatus: integer("http_status"),
		durationMs: integer("duration_ms"),
		newEntries: integer("new_entries").notNull().default(0),
		error: text("error"),
		etag: text("etag"),
		lastModified: text("last_modified"),
	},
	(t) => [index("fetch_logs_feed_idx").on(t.feedId, t.fetchedAt)],
);

/** Global key/value settings. */
export const settings = sqliteTable("settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" })
		.notNull()
		.$defaultFn(() => new Date()),
});

export type RefreshJob = typeof refreshJobs.$inferSelect;
export type FetchLog = typeof fetchLogs.$inferSelect;
