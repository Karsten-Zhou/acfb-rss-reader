import { describe, expect, test } from "bun:test";
import { createTestContext, type TestContext } from "./helpers.ts";

const SUB = {
	endpoint: "https://push.example.com/device-1",
	expirationTime: null,
	keys: { p256dh: "p256-1", auth: "auth-1" },
};

/** Authenticate a fresh test context: logs in the allowed user. */
async function auth(ctx: TestContext): Promise<string> {
	const restore = mockGithub(ctx);
	try {
		await seedOAuthState(ctx, "state-token-login");
		const res = await ctx.app.request(
			"/api/auth/callback?code=abc&state=state-token-login",
			{},
			ctx.env,
		);
		expect(res.status).toBe(302);
		const setCookie = res.headers.getSetCookie?.()[0] ?? res.headers.get("set-cookie") ?? "";
		const token = /rss_session=([^;]+)/.exec(setCookie)?.[1];
		expect(token).toBeTruthy();
		return token!;
	} finally {
		restore();
	}
}

const GH_USER = { id: 12345, login: "testuser", name: "Test User", avatar_url: null };

/** Stub GitHub's token + user endpoints. */
function mockGithub(_ctx: TestContext): () => void {
	const original = globalThis.fetch;
	const fetchGlobal = globalThis as unknown as { fetch: typeof fetch };
	fetchGlobal.fetch = (async (input: RequestInfo | URL) => {
		const url =
			typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
		if (url.includes("/login/oauth/access_token")) {
			return new Response(JSON.stringify({ access_token: "gho_token" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		if (url.includes("api.github.com/user")) {
			return new Response(JSON.stringify(GH_USER), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		throw new Error(`Unexpected fetch call: ${url}`);
	}) as typeof fetch;
	return () => {
		fetchGlobal.fetch = original;
	};
}

async function seedOAuthState(ctx: TestContext, state: string): Promise<void> {
	await ctx.env.KV_STORE.put(
		`oauth:${state}`,
		JSON.stringify({
			state,
			redirectTo: "http://localhost:8787/",
			expiresAt: Date.now() + 600_000,
		}),
	);
}

function authed(token: string, init: RequestInit = {}): RequestInit {
	return {
		...init,
		headers: {
			"Content-Type": "application/json",
			Cookie: `rss_session=${token}`,
			...(init.headers ?? {}),
		},
	};
}

describe("GET /api/push/capability", () => {
	test("returns 401 without auth", async () => {
		const ctx = createTestContext();
		const res = await ctx.app.request("/api/push/capability", {}, ctx.env);
		expect(res.status).toBe(401);
	});

	test("returns VAPID key + config for an authenticated user", async () => {
		const ctx = createTestContext();
		const token = await auth(ctx);
		const res = await ctx.app.request("/api/push/capability", authed(token), ctx.env);
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
	test("returns 401 without auth", async () => {
		const ctx = createTestContext();
		const res = await ctx.app.request("/api/push/key", {}, ctx.env);
		expect(res.status).toBe(401);
	});

	test("returns the public VAPID key", async () => {
		const ctx = createTestContext();
		const token = await auth(ctx);
		const res = await ctx.app.request("/api/push/key", authed(token), ctx.env);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { publicKey: string };
		expect(body.publicKey).toBeTruthy();
	});
});

describe("PUT /api/push/subscription", () => {
	test("creates a subscription for the authenticated user", async () => {
		const ctx = createTestContext();
		const token = await auth(ctx);
		const res = await ctx.app.request(
			"/api/push/subscription",
			authed(token, { method: "PUT", body: JSON.stringify(SUB) }),
			ctx.env,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { ok: boolean; id: number };
		expect(body.ok).toBe(true);
		expect(body.id).toBeGreaterThan(0);
	});

	test("is idempotent: re-subscribing the same endpoint updates, not duplicates", async () => {
		const ctx = createTestContext();
		const token = await auth(ctx);
		await ctx.app.request(
			"/api/push/subscription",
			authed(token, { method: "PUT", body: JSON.stringify(SUB) }),
			ctx.env,
		);
		await ctx.app.request(
			"/api/push/subscription",
			authed(token, { method: "PUT", body: JSON.stringify(SUB) }),
			ctx.env,
		);
		const count = ctx.sqlite.query("SELECT COUNT(*) AS n FROM push_subscriptions").get() as {
			n: number;
		};
		expect(count.n).toBe(1);
	});

	test("rejects an invalid payload", async () => {
		const ctx = createTestContext();
		const token = await auth(ctx);
		const res = await ctx.app.request(
			"/api/push/subscription",
			authed(token, {
				method: "PUT",
				body: JSON.stringify({ endpoint: "not-a-url", keys: {} }),
			}),
			ctx.env,
		);
		expect(res.status).toBe(400);
	});

	test("rejects without auth", async () => {
		const ctx = createTestContext();
		const res = await ctx.app.request(
			"/api/push/subscription",
			{ method: "PUT", body: JSON.stringify(SUB) },
			ctx.env,
		);
		expect(res.status).toBe(401);
	});
});

describe("DELETE /api/push/subscription/:id", () => {
	test("removes the user's own subscription", async () => {
		const ctx = createTestContext();
		const token = await auth(ctx);
		const created = (await (
			await ctx.app.request(
				"/api/push/subscription",
				authed(token, { method: "PUT", body: JSON.stringify(SUB) }),
				ctx.env,
			)
		).json()) as { id: number };

		const res = await ctx.app.request(
			`/api/push/subscription/${created.id}`,
			authed(token, { method: "DELETE" }),
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
		const token = await auth(ctx);
		const res = await ctx.app.request(
			"/api/push/subscription/9999",
			authed(token, { method: "DELETE" }),
			ctx.env,
		);
		expect(res.status).toBe(404);
	});
});

describe("ownership", () => {
	test("a user cannot delete another user's subscription", async () => {
		// Single-user app, but the endpoint still enforces ownership: create a
		// subscription as the authenticated user, then the same user is the
		// only one — no cross-user scenarios. We assert the query scopes by
		// userId by creating a row directly for a different (fake) user.
		const ctx = createTestContext();
		const token = await auth(ctx);

		// Insert a subscription for a different user id directly into SQLite.
		ctx.sqlite
			.query(
				"INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at, updated_at) VALUES (999, ?, 'k', 'a', 0, 0)",
			)
			.run(`${SUB.endpoint}-other`);

		const res = await ctx.app.request(
			"/api/push/subscription/1",
			authed(token, { method: "DELETE" }),
			ctx.env,
		);
		// The row id 1 belongs to user 999, not the authed user.
		expect(res.status).toBe(404);
		const remaining = ctx.sqlite.query("SELECT COUNT(*) AS n FROM push_subscriptions").get() as {
			n: number;
		};
		expect(remaining.n).toBe(1);
	});
});
