import { Database as BunSqlite } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";

import { createDb, type Database } from "@rss/database";

import { createApp } from "../src/app.ts";
import type { App, Env } from "../src/types.ts";
import { createD1Mock } from "./d1-mock.ts";
import { createKvMock } from "./kv-mock.ts";

/** Apply all SQL migration files to a bun:sqlite database, in order. */
export function applyMigrations(sqlite: BunSqlite): void {
	const dir = new URL("../../database/migrations/", import.meta.url);
	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".sql"))
		.sort();
	for (const file of files) {
		sqlite.exec(readFileSync(new URL(file, dir), "utf8"));
	}
}

export interface TestContext {
	env: Env;
	/** The underlying bun:sqlite database for assertions. */
	sqlite: BunSqlite;
	db: Database;
	app: App;
}

/** Create a fully-wired test app backed by in-memory SQLite + KV mocks. */
export function createTestContext(overrides: Partial<Env> = {}): TestContext {
	const sqlite = new BunSqlite(":memory:");
	applyMigrations(sqlite);

	const env: Env = {
		DB: createD1Mock(sqlite),
		KV_STORE: createKvMock(),
		REFRESH_WORKFLOW: {} as Env["REFRESH_WORKFLOW"],
		GITHUB_CLIENT_ID: "test-client-id",
		GITHUB_CLIENT_SECRET: "test-client-secret",
		ALLOWED_GITHUB_USER_ID: "12345",
		APP_ORIGIN: "http://localhost:5173",
		ENVIRONMENT: "development",
		...overrides,
	};

	const db = createDb(env.DB);
	const app = createApp(env);
	return { env, sqlite, db, app };
}
