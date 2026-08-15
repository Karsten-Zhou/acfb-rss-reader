import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { createDb, feeds } from "../../server/db/index.ts";
import { applyMigrations, createD1Mock } from "../../server/db/testing/index.ts";

import { ingestFeed } from "../../server/feeds/ingest.ts";
import { parseFeedDocument } from "../../server/feeds/parse.ts";

const rss = readFileSync(new URL("./fixtures/rss.xml", import.meta.url), "utf8");

function makeDb() {
	const sqlite = new Database(":memory:");
	applyMigrations(sqlite);
	return { sqlite, db: createDb(createD1Mock(sqlite)) };
}

test("ingests new entries and deduplicates on the next run", async () => {
	const { db, sqlite } = makeDb();
	const feed = await db
		.insert(feeds)
		.values({ url: "https://example.com/feed.xml", title: "Example Feed" })
		.returning()
		.get();

	const parsed = parseFeedDocument(rss, "https://example.com/feed.xml");

	const first = await ingestFeed(db, feed.id, parsed);
	expect(first.newEntries).toBe(2);

	const entryCount = sqlite.query("SELECT COUNT(*) AS n FROM entries").get() as { n: number };
	expect(entryCount.n).toBe(2);
	const readCount = sqlite.query("SELECT COUNT(*) AS n FROM read_status").get() as { n: number };
	expect(readCount.n).toBe(2);
	const contentCount = sqlite.query("SELECT COUNT(*) AS n FROM entry_contents").get() as {
		n: number;
	};
	expect(contentCount.n).toBe(2);
	const ftsCount = sqlite.query("SELECT COUNT(*) AS n FROM entries_fts").get() as { n: number };
	expect(ftsCount.n).toBe(2);

	// FTS lookup works against ingested content
	const matches = sqlite
		.query("SELECT entry_id FROM entries_fts WHERE entries_fts MATCH 'Full article'")
		.all() as { entry_id: number }[];
	expect(matches).toHaveLength(1);

	// Second run: all entries already exist → nothing new
	const second = await ingestFeed(db, feed.id, parsed);
	expect(second.newEntries).toBe(0);
	expect((sqlite.query("SELECT COUNT(*) AS n FROM entries").get() as { n: number }).n).toBe(2);
});
