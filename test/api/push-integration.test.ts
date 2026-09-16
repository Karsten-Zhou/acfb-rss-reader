import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

import { createDb, feeds, notificationDeliveries } from "../../server/db/index.ts";
import { applyMigrations, createD1Mock, createKvMock } from "../../server/db/testing/index.ts";
import { upsertPushSubscription } from "../../server/notifications/subscriptions.ts";
import type { Env } from "../../server/types.ts";

// Mock web-push so delivery is deterministic (no network). The mock records
// every send so tests can assert on how many pushes went out.
const sent: Array<{ endpoint: string }> = [];
mock.module("web-push", () => ({
	default: {
		setVapidDetails: () => {},
		generateVAPIDKeys: () => ({ publicKey: "x", privateKey: "y" }),
		sendNotification: async (sub: { endpoint: string }): Promise<unknown> => {
			sent.push({ endpoint: sub.endpoint });
			return { statusCode: 201 };
		},
	},
}));

// Mock global fetch so the feed refresh succeeds without real network I/O.
globalThis.fetch = (async (_input: RequestInfo | URL) =>
	new Response(rss, {
		status: 200,
		headers: { "Content-Type": "application/rss+xml" },
	})) as typeof fetch;

const { refreshFeeds } = await import("../../server/feeds/refresh.ts");

const VAPID_PUBLIC =
	"BAWmJHdhDOHmR9jV5mpWYSvfog5PKt1F9Yd5s-PW353vMwLX1Wr1-hk43nefqtQsvaLv1w59icTAsXLhxoiQ-lE";
const VAPID_PRIVATE = "AVgvjt4uMjnO2DABsiIb2ZNz4BGSCwXJfdX5gOQNZoE";

// An RSS fixture with 2 entries.
const rss = readFileSync(new URL("../feeds/fixtures/rss.xml", import.meta.url), "utf8");

function makeEnv(): Env {
	return {
		DB: null as never,
		KV_STORE: createKvMock() as Env["KV_STORE"],
		REFRESH_WORKFLOW: {} as Env["REFRESH_WORKFLOW"],
		ENVIRONMENT: "development",
		VAPID_PUBLIC_KEY: VAPID_PUBLIC,
		VAPID_PRIVATE_KEY: VAPID_PRIVATE,
		VAPID_SUBJECT: "mailto:test@example.com",
	};
}

function makeDb() {
	const sqlite = new Database(":memory:");
	applyMigrations(sqlite);
	return { sqlite, db: createDb(createD1Mock(sqlite)) };
}

const SUB = {
	endpoint: "https://push.example.com/integration",
	expirationTime: null,
	keys: { p256dh: "p256", auth: "auth" },
};

beforeEach(() => {
	sent.length = 0;
});

describe("refresh -> notify integration", () => {
	test("new entries are notified once; re-refresh does not duplicate", async () => {
		const { db } = makeDb();
		const env = makeEnv();

		// Seed a subscription (per-device opt-in).
		await upsertPushSubscription(db, SUB);

		// Seed an existing feed.
		const [feed] = await db
			.insert(feeds)
			.values({
				url: "https://example.com/feed.xml",
				title: "Example Feed",
				lastFetchedAt: new Date(0),
				nextFetchAt: new Date(0),
			})
			.returning({ id: feeds.id });

		// Put the RSS body in KV so the fetch succeeds (cache-first).
		await env.KV_STORE.put(`feed-body:https://example.com/feed.xml`, rss);

		// First refresh: ingest 2 new entries + send 2 notifications.
		await refreshFeeds(db, env.KV_STORE, [feed!.id], { env });
		expect(sent.length).toBe(2);

		const delivered = await db.select().from(notificationDeliveries).all();
		expect(delivered.length).toBe(2);
		expect(delivered.every((d) => d.status === "sent")).toBe(true);

		// Re-refresh the same feed: entries already exist, no new notifications.
		await refreshFeeds(db, env.KV_STORE, [feed!.id], { env });
		expect(sent.length).toBe(2); // unchanged — no duplicates

		const deliveredAgain = await db.select().from(notificationDeliveries).all();
		expect(deliveredAgain.length).toBe(2); // still only 2 ledger rows
	});

	test("notifications are skipped when no device is subscribed", async () => {
		const { db } = makeDb();
		const env = makeEnv();

		// No subscription — notifications are opt-in per device.

		const [feed] = await db
			.insert(feeds)
			.values({
				url: "https://example.com/feed2.xml",
				title: "Feed Two",
				lastFetchedAt: new Date(0),
				nextFetchAt: new Date(0),
			})
			.returning({ id: feeds.id });
		await env.KV_STORE.put(`feed-body:https://example.com/feed2.xml`, rss);

		await refreshFeeds(db, env.KV_STORE, [feed!.id], { env });

		// Entries ingested but no notifications sent.
		expect(sent.length).toBe(0);
		const delivered = await db.select().from(notificationDeliveries).all();
		expect(delivered.length).toBe(0);
	});
});
