import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";

import {
	createDb,
	notificationDeliveries,
	pushSubscriptions,
	users,
} from "../../server/db/index.ts";
import { applyMigrations, createD1Mock } from "../../server/db/testing/index.ts";

const sent: Array<{ endpoint: string; payload: string }> = [];
const results: Record<string, { statusCode?: number; error?: boolean }> = {};

// Mock web-push so we can deterministically simulate success, push-service
// 404/410 ("expired") and generic failures without network access.
mock.module("web-push", () => ({
	default: {
		setVapidDetails: () => {},
		generateVAPIDKeys: () => ({ publicKey: "x", privateKey: "y" }),
		sendNotification: async (sub: { endpoint: string }, payload: string): Promise<unknown> => {
			sent.push({ endpoint: sub.endpoint, payload });
			const r = results[sub.endpoint];
			if (r?.error) {
				const err = new Error("network") as Error & { statusCode?: number };
				if (r.statusCode) err.statusCode = r.statusCode;
				throw err;
			}
			if (r?.statusCode) {
				const err = new Error("expired") as Error & { statusCode?: number };
				err.statusCode = r.statusCode;
				throw err;
			}
			return { statusCode: 201 };
		},
	},
}));

// Import AFTER the mock so the HMR-ish module resolution picks up the mock.
const { notifyNewEntry, buildPayload } = await import("../../server/notifications/service.ts");

const VAPID_PUBLIC =
	"BAWmJHdhDOHmR9jV5mpWYSvfog5PKt1F9Yd5s-PW353vMwLX1Wr1-hk43nefqtQsvaLv1w59icTAsXLhxoiQ-lE";
const VAPID_PRIVATE = "AVgvjt4uMjnO2DABsiIb2ZNz4BGSCwXJfdX5gOQNZoE";

type Env = {
	DB: unknown;
	KV_STORE: unknown;
	REFRESH_WORKFLOW: unknown;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	ALLOWED_GITHUB_USER_ID: string;
	APP_ORIGIN: string;
	ENVIRONMENT: string;
	VAPID_PUBLIC_KEY: string;
	VAPID_PRIVATE_KEY: string;
	VAPID_SUBJECT: string;
};

function makeEnv(privateKey = VAPID_PRIVATE): Env {
	return {
		DB: null,
		KV_STORE: {},
		REFRESH_WORKFLOW: {},
		GITHUB_CLIENT_ID: "test",
		GITHUB_CLIENT_SECRET: "test",
		ALLOWED_GITHUB_USER_ID: "1",
		APP_ORIGIN: "https://example.com",
		ENVIRONMENT: "development",
		VAPID_PUBLIC_KEY: VAPID_PUBLIC,
		VAPID_PRIVATE_KEY: privateKey,
		VAPID_SUBJECT: "mailto:test@example.com",
	};
}

function makeDb() {
	const sqlite = new Database(":memory:");
	applyMigrations(sqlite);
	const db = createDb(createD1Mock(sqlite));
	return { sqlite, db };
}

type TestDb = ReturnType<typeof makeDb>["db"];

const SUB_A = {
	endpoint: "https://push.example.com/a",
	expirationTime: null,
	keys: { p256dh: "p256-a", auth: "auth-a" },
};
const SUB_B = {
	endpoint: "https://push.example.com/b",
	expirationTime: null,
	keys: { p256dh: "p256-b", auth: "auth-b" },
};
const SUB_DEAD = {
	endpoint: "https://push.example.com/dead",
	expirationTime: null,
	keys: { p256dh: "p256-dead", auth: "auth-dead" },
};

async function seedUser(db: TestDb): Promise<number> {
	const [user] = await db
		.insert(users)
		.values({ githubId: 1, githubLogin: "testuser", name: null, avatarUrl: null })
		.returning({ id: users.id });
	return user!.id;
}

async function addSub(db: TestDb, userId: number, sub: typeof SUB_A): Promise<number> {
	const { upsertPushSubscription } = await import("../../server/notifications/subscriptions.ts");
	const { id } = await upsertPushSubscription(db, userId, sub);
	return id;
}

function notification(entryId: number) {
	return {
		entryId,
		title: `Article ${entryId}`,
		url: `https://example.com/${entryId}`,
		feedId: 1,
		feedTitle: "Feed",
	};
}

beforeEach(() => {
	sent.length = 0;
	delete results[SUB_A.endpoint];
	delete results[SUB_B.endpoint];
	delete results[SUB_DEAD.endpoint];
});

describe("buildPayload", () => {
	test("builds a compact payload without article content", () => {
		const payload = buildPayload({
			entryId: 42,
			title: "Big launch!",
			url: "https://example.com/post",
			feedId: 7,
			feedTitle: "Example Feed",
		});
		expect(payload).toEqual({
			type: "new-feed-entry",
			title: "Example Feed",
			body: "Big launch!",
			tag: "feed-entry:42",
			url: "/reader/42",
			entryId: 42,
			feedId: 7,
		});
	});
});

describe("notifyNewEntry multi-subscription delivery", () => {
	test("sends to all active subscriptions", async () => {
		const { db } = makeDb();
		const userId = await seedUser(db);
		await addSub(db, userId, SUB_A);
		await addSub(db, userId, SUB_B);

		await notifyNewEntry(db, makeEnv() as never, notification(10));

		expect(sent.map((s) => s.endpoint).sort()).toEqual([SUB_A.endpoint, SUB_B.endpoint].sort());

		const rows = await db.select().from(notificationDeliveries).all();
		expect(rows[0]!.targetCount).toBe(2);
		// Both subscriptions still active.
		const active = await db
			.select()
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.active, true));
		expect(active.length).toBe(2);
	});

	test("deactivates a dead endpoint but keeps delivering to the rest", async () => {
		const { db } = makeDb();
		const userId = await seedUser(db);
		await addSub(db, userId, SUB_A);
		await addSub(db, userId, SUB_DEAD);

		// SUB_DEAD reports 410 Gone from the push service.
		results[SUB_DEAD.endpoint] = { statusCode: 410 };

		await notifyNewEntry(db, makeEnv() as never, notification(11));

		// Sent to both, but the dead one is deactivated afterward.
		expect(sent.map((s) => s.endpoint).sort()).toEqual([SUB_A.endpoint, SUB_DEAD.endpoint].sort());
		const deadRow = await db
			.select()
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.endpoint, SUB_DEAD.endpoint));
		expect(deadRow[0]!.active).toBe(false);
		const aliveRow = await db
			.select()
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.endpoint, SUB_A.endpoint));
		expect(aliveRow[0]!.active).toBe(true);
	});

	test("does not fail the whole operation when one endpoint errors generically", async () => {
		const { db } = makeDb();
		const userId = await seedUser(db);
		await addSub(db, userId, SUB_A);
		await addSub(db, userId, SUB_B);

		results[SUB_B.endpoint] = { error: true, statusCode: 500 };

		await notifyNewEntry(db, makeEnv() as never, notification(12));

		// Both attempted; the failing one accumulates a failure but the
		// operation itself succeeds.
		expect(sent.length).toBe(2);
		const row = await db.select().from(notificationDeliveries).all();
		expect(row[0]!.status).toBe("sent");
		const failed = await db
			.select()
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.endpoint, SUB_B.endpoint));
		expect(failed[0]!.failureCount).toBe(1);
	});
});

describe("notifyNewEntry failure handling", () => {
	test("deactivates a subscription only after repeated failures", async () => {
		const { db } = makeDb();
		const userId = await seedUser(db);
		await addSub(db, userId, SUB_A);

		results[SUB_A.endpoint] = { error: true, statusCode: 500 };

		// Three failures mark it inactive (MAX_FAILURES_BEFORE_DEACTIVATE = 3).
		// Each notification is a different entry, so no idempotency clash.
		for (let i = 0; i < 3; i += 1) {
			await notifyNewEntry(db, makeEnv() as never, notification(100 + i));
		}
		const row = await db
			.select()
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.endpoint, SUB_A.endpoint));
		expect(row[0]!.failureCount).toBe(3);
		expect(row[0]!.active).toBe(false);
	});
});

describe("notifyNewEntry idempotency", () => {
	test("does not send twice for the same entry even with VAPID configured", async () => {
		const { db } = makeDb();
		const userId = await seedUser(db);
		await addSub(db, userId, SUB_A);

		await notifyNewEntry(db, makeEnv() as never, notification(1));
		const afterFirst = sent.filter((s) => s.endpoint === SUB_A.endpoint).length;

		// Re-run the same entry — no duplicate send.
		await notifyNewEntry(db, makeEnv() as never, notification(1));
		const afterSecond = sent.filter((s) => s.endpoint === SUB_A.endpoint).length;

		expect(afterFirst).toBe(1);
		expect(afterSecond).toBe(1); // unchanged

		const rows = await db.select().from(notificationDeliveries).all();
		expect(rows.length).toBe(1);
	});

	test("skips when no device is subscribed (per-device opt-in)", async () => {
		const { db } = makeDb();
		await seedUser(db);
		// No subscription added — notifications are opt-in per device.

		const ok = await notifyNewEntry(db, makeEnv() as never, notification(5));

		expect(ok).toBe(false);
		expect(sent.length).toBe(0);
		const rows = await db.select().from(notificationDeliveries).all();
		expect(rows.length).toBe(0);
	});

	test("skips gracefully when VAPID is not configured", async () => {
		const { db } = makeDb();
		const userId = await seedUser(db);
		await addSub(db, userId, SUB_A);

		const ok = await notifyNewEntry(db, makeEnv("") as never, notification(9));
		expect(ok).toBe(false);
		expect(sent.length).toBe(0);
	});
});
