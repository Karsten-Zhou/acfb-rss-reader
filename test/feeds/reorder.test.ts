import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

import { createDb, feeds } from "../../server/db/index.ts";
import { applyMigrations, createD1Mock } from "../../server/db/testing/index.ts";

import { listFeeds, reorderFeeds } from "../../server/feeds/index.ts";

function makeDb() {
	const sqlite = new Database(":memory:");
	applyMigrations(sqlite);
	return { sqlite, db: createDb(createD1Mock(sqlite)) };
}

test("reorderFeeds persists a new sidebar order", async () => {
	const { db } = makeDb();

	// Titles intentionally sort differently from ids so we can prove the
	// sidebar order comes from `position`, not the title.
	const a = await db
		.insert(feeds)
		.values({ url: "https://a.example/feed.xml", title: "Zeta Feed", position: 0 })
		.returning()
		.get();
	const b = await db
		.insert(feeds)
		.values({ url: "https://b.example/feed.xml", title: "Alpha Feed", position: 1 })
		.returning()
		.get();
	const c = await db
		.insert(feeds)
		.values({ url: "https://c.example/feed.xml", title: "Middle Feed", position: 2 })
		.returning()
		.get();

	let ordered = await listFeeds(db);
	expect(ordered.map((f) => f.id)).toEqual([a.id, b.id, c.id]);

	await reorderFeeds(db, [c.id, a.id, b.id]);

	ordered = await listFeeds(db);
	expect(ordered.map((f) => f.id)).toEqual([c.id, a.id, b.id]);
});

test("reorderFeeds with an empty list is a no-op", async () => {
	const { db } = makeDb();
	await expect(reorderFeeds(db, [])).resolves.toBeUndefined();
});
