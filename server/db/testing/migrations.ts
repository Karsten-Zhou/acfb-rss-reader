import type { Database as BunSqlite } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";

/** Apply all SQL migration files (in order) to a bun:sqlite database. */
export function applyMigrations(sqlite: BunSqlite): void {
	const dir = new URL("../migrations/", import.meta.url);
	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".sql"))
		.sort();
	for (const file of files) {
		sqlite.exec(readFileSync(new URL(file, dir), "utf8"));
	}
}
