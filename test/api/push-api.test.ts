import { describe, expect, test } from "bun:test";
import { createTestContext } from "./helpers.ts";

const SUB = {
	endpoint: "https://push.example.com/device-1",
	expirationTime: null,
	keys: { p256dh: "p256-1", auth: "auth-1" },
};

function json(init: RequestInit = {}): RequestInit {
	return { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } };
}

describe("GET /api/push/capability", () => {
	test("returns VAPID key + config", async () => {
		const ctx = createTestContext();
		const res = await ctx.app.request("/api/push/capability", {}, ctx.env);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			configured: boolean;
			publicKey: string | null;
			subscriptions: unknown[];
		};
		expect(body.configured).toBe(true);
		expect(body.publicKey).toBeTruthy();
		expect(body.subscriptions).toEqual([]);
	});
});

describe("GET /api/push/key", () => {
	test("returns the public VAPID key", async () => {
		const ctx = createTestContext();
		const res = await ctx.app.request("/api/push/key", {}, ctx.env);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { publicKey: string };
		expect(body.publicKey).toBeTruthy();
	});

	test("returns 409 when push is not configured", async () => {
		const ctx = createTestContext({ VAPID_PUBLIC_KEY: "" });
		const res = await ctx.app.request("/api/push/key", {}, ctx.env);
		expect(res.status).toBe(409);
	});
});

describe("PUT /api/push/subscription", () => {
	test("creates a subscription", async () => {
		const ctx = createTestContext();
		const res = await ctx.app.request(
			"/api/push/subscription",
			json({ method: "PUT", body: JSON.stringify(SUB) }),
			ctx.env,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean; id: number };
		expect(body.ok).toBe(true);
		expect(body.id).toBeGreaterThan(0);
	});

	test("is idempotent: re-subscribing the same endpoint updates, not duplicates", async () => {
		const ctx = createTestContext();
		await ctx.app.request(
			"/api/push/subscription",
			json({ method: "PUT", body: JSON.stringify(SUB) }),
			ctx.env,
		);
		await ctx.app.request(
			"/api/push/subscription",
			json({ method: "PUT", body: JSON.stringify(SUB) }),
			ctx.env,
		);
		const count = ctx.sqlite.query("SELECT COUNT(*) AS n FROM push_subscriptions").get() as {
			n: number;
		};
		expect(count.n).toBe(1);
	});

	test("rejects an invalid payload", async () => {
		const ctx = createTestContext();
		const res = await ctx.app.request(
			"/api/push/subscription",
			json({ method: "PUT", body: JSON.stringify({ endpoint: "not-a-url", keys: {} }) }),
			ctx.env,
		);
		expect(res.status).toBe(400);
	});
});

describe("DELETE /api/push/subscription/:id", () => {
	test("removes a subscription", async () => {
		const ctx = createTestContext();
		const created = (await (
			await ctx.app.request(
				"/api/push/subscription",
				json({ method: "PUT", body: JSON.stringify(SUB) }),
				ctx.env,
			)
		).json()) as { id: number };

		const res = await ctx.app.request(
			`/api/push/subscription/${created.id}`,
			json({ method: "DELETE" }),
			ctx.env,
		);
		expect(res.status).toBe(200);
		const count = ctx.sqlite.query("SELECT COUNT(*) AS n FROM push_subscriptions").get() as {
			n: number;
		};
		expect(count.n).toBe(0);
	});

	test("404 when deleting a non-existent subscription", async () => {
		const ctx = createTestContext();
		const res = await ctx.app.request(
			"/api/push/subscription/9999",
			json({ method: "DELETE" }),
			ctx.env,
		);
		expect(res.status).toBe(404);
	});
});

describe("POST /api/push/subscription/remove", () => {
	test("removes a subscription by endpoint", async () => {
		const ctx = createTestContext();
		await ctx.app.request(
			"/api/push/subscription",
			json({ method: "PUT", body: JSON.stringify(SUB) }),
			ctx.env,
		);
		const res = await ctx.app.request(
			"/api/push/subscription/remove",
			json({ method: "POST", body: JSON.stringify({ endpoint: SUB.endpoint }) }),
			ctx.env,
		);
		expect(res.status).toBe(200);
		const count = ctx.sqlite.query("SELECT COUNT(*) AS n FROM push_subscriptions").get() as {
			n: number;
		};
		expect(count.n).toBe(0);
	});
});
