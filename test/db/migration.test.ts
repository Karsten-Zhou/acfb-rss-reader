import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { applyMigrations } from "../../server/db/testing/index.ts";

const migrationPath = new URL("../../server/db/migrations/0000_init.sql", import.meta.url);

test("initial migration applies cleanly", () => {
	const db = new Database(":memory:");
	const sql = readFileSync(migrationPath, "utf8");
	db.exec(sql);

	const tables = (
		db.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
			name: string;
		}[]
	).map((t) => t.name);

	expect(tables).toEqual(
		expect.arrayContaining([
			"feeds",
			"feed_folders",
			"entries",
			"entry_contents",
			"tags",
			"entry_tags",
			"starred",
			"read_status",
			"refresh_jobs",
			"fetch_logs",
			"settings",
			"entries_fts",
		]),
	);
});

test("FTS5 virtual table supports insert and MATCH queries", () => {
	const db = new Database(":memory:");
	const sql = readFileSync(migrationPath, "utf8");
	db.exec(sql);

	db.query(
		`INSERT INTO entries_fts (entry_id, title, content, author, feed_title, tags)
     VALUES (1, 'Hello world', 'Some content here', 'Alice', 'Example Feed', 'news tech')`,
	).run();

	const rows = db
		.query("SELECT entry_id FROM entries_fts WHERE entries_fts MATCH 'hello'")
		.all() as { entry_id: number }[];

	expect(rows).toHaveLength(1);
	expect(rows[0]?.entry_id).toBe(1);
});

test("all migrations apply cleanly, including push tables", () => {
	const db = new Database(":memory:");
	applyMigrations(db);

	const tables = (
		db.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
			name: string;
		}[]
	).map((t) => t.name);

	expect(tables).toEqual(expect.arrayContaining(["push_subscriptions", "notification_deliveries"]));

	// The delivery ledger uses a composite primary key for idempotency.
	const pk = db
		.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='notification_deliveries'")
		.get() as { sql: string };
	expect(pk.sql).toContain("PRIMARY KEY(`entry_id`, `notification_type`)");
});
