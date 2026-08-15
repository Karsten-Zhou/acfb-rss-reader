import { Database as BunSqlite } from "bun:sqlite";
import { expect, test } from "bun:test";
import { DEFAULT_SUMMARY_MODEL } from "../../server/ai/models.ts";
import { AI_ENABLED_KEY, AI_MODEL_KEY, getAiSettings } from "../../server/ai/settings.ts";
import { createDb, type Database, settings } from "../../server/db/index.ts";
import { applyMigrations, createD1Mock } from "../../server/db/testing/index.ts";

function makeDb(): Database {
	const sqlite = new BunSqlite(":memory:");
	applyMigrations(sqlite);
	return createDb(createD1Mock(sqlite));
}

test("getAiSettings defaults to disabled and the default model", async () => {
	const ai = await getAiSettings(makeDb());
	expect(ai.enabled).toBe(false);
	expect(ai.modelKey).toBe(DEFAULT_SUMMARY_MODEL);
});

test("getAiSettings reads stored preferences", async () => {
	const db = makeDb();
	await db.insert(settings).values({ key: AI_ENABLED_KEY, value: "true" }).run();
	await db
		.insert(settings)
		.values({ key: AI_MODEL_KEY, value: JSON.stringify("qwen3-30b-a3b-fp8") })
		.run();
	const ai = await getAiSettings(db);
	expect(ai.enabled).toBe(true);
	expect(ai.modelKey).toBe("qwen3-30b-a3b-fp8");
});

test("getAiSettings falls back to the default model for a non-string value", async () => {
	const db = makeDb();
	await db.insert(settings).values({ key: AI_ENABLED_KEY, value: "true" }).run();
	await db
		.insert(settings)
		.values({ key: AI_MODEL_KEY, value: JSON.stringify(123) })
		.run();
	const ai = await getAiSettings(db);
	expect(ai.enabled).toBe(true);
	expect(ai.modelKey).toBe(DEFAULT_SUMMARY_MODEL);
});
