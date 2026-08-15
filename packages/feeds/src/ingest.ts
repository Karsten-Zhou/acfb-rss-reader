import { type Database, entries, entriesFts, entryContents, readStatus } from "@rss/database";
import { MAX_ENTRIES_PER_FETCH } from "@rss/shared";
import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import striptags from "striptags";

import type { IngestStats, ParsedEntry, ParsedFeed } from "./types.ts";

const MAX_CONTENT_TEXT = 10_000;

function toContentText(entry: ParsedEntry): string {
	if (entry.content) {
		return striptags(entry.content).replace(/\s+/g, " ").trim().slice(0, MAX_CONTENT_TEXT);
	}
	return entry.summary ?? "";
}

/**
 * Persist a parsed feed's entries into the database:
 * - deduplicate by (feedId, guid)
 * - insert entry + default read_status + content row
 * - index into the FTS5 search table
 *
 * Entries are inserted in a single D1 batch (`.returning()` captures each
 * new id), then all dependent rows are written in a second batch.
 */
export async function ingestFeed(
	db: Database,
	feedId: number,
	parsed: ParsedFeed,
): Promise<IngestStats> {
	const existingRows = await db
		.select({ guid: entries.guid })
		.from(entries)
		.where(eq(entries.feedId, feedId))
		.all();
	const existing = new Set(existingRows.map((row) => row.guid));

	const newEntries: ParsedEntry[] = [];
	for (const entry of parsed.entries) {
		if (newEntries.length >= MAX_ENTRIES_PER_FETCH) break;
		if (!entry.guid || existing.has(entry.guid)) continue;
		existing.add(entry.guid);
		newEntries.push(entry);
	}
	if (newEntries.length === 0) {
		return { newEntries: 0, totalEntries: 0 };
	}

	// Pass 1: insert entries, capturing the new ids.
	const insertQueries = newEntries.map((entry) =>
		db
			.insert(entries)
			.values({
				feedId,
				guid: entry.guid,
				url: entry.url,
				title: entry.title,
				author: entry.author,
				summary: entry.summary,
				imageUrl: entry.imageUrl,
				publishedAt: entry.publishedAt,
				updatedAt: entry.updatedAt,
			})
			.returning({ id: entries.id }),
	);
	const insertResults = await db.batch(
		insertQueries as [(typeof insertQueries)[number], ...(typeof insertQueries)[number][]],
	);
	const ids = insertResults.map((result) => result[0]!.id);

	// Pass 2: dependent rows (read status, content, FTS index) in one batch.
	const dependent: BatchItem<"sqlite">[] = [];
	for (const [index, entry] of newEntries.entries()) {
		const id = ids[index]!;
		dependent.push(db.insert(readStatus).values({ entryId: id }));

		const contentText = toContentText(entry);
		if (entry.content || entry.summary) {
			dependent.push(
				db.insert(entryContents).values({ entryId: id, content: entry.content, contentText }),
			);
		}
		dependent.push(
			db.insert(entriesFts).values({
				entryId: id,
				title: entry.title,
				content: contentText,
				author: entry.author ?? "",
				feedTitle: parsed.title,
				tags: "",
			}),
		);
	}
	await db.batch(dependent as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

	return { newEntries: newEntries.length, totalEntries: newEntries.length };
}
