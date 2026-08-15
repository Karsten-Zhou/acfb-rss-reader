import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationPath = new URL("../migrations/0000_ordinary_dexter_bennett.sql", import.meta.url);

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
			"users",
			"sessions",
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
