import { Database as BunSqlite } from "bun:sqlite";
import { createApp } from "../../server/app.ts";
import { createDb, type Database } from "../../server/db/index.ts";
import { applyMigrations, createD1Mock, createKvMock } from "../../server/db/testing/index.ts";
import type { App, Env } from "../../server/types.ts";

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
		APP_ORIGIN: "http://localhost:8787",
		ENVIRONMENT: "development",
		VAPID_PUBLIC_KEY: "test-vapid-public-key",
		VAPID_PRIVATE_KEY: "test-vapid-private-key",
		VAPID_SUBJECT: "mailto:test@example.com",
		...overrides,
	};

	const db = createDb(env.DB);
	const app = createApp(env);
	return { env, sqlite, db, app };
}
