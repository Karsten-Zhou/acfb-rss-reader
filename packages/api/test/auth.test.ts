import { describe, expect, test } from "bun:test";

import { createTestContext, type TestContext } from "./helpers.ts";

const GH_USER = { id: 12345, login: "testuser", name: "Test User", avatar_url: null };

/** Stub GitHub's token + user endpoints. Returns a restore function. */
function mockGitHubFetch(options: { user?: unknown; tokenError?: boolean } = {}): () => void {
	const original = globalThis.fetch;
	const fetchGlobal = globalThis as unknown as { fetch: typeof fetch };
	fetchGlobal.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
		const url =
			typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
		if (url.includes("/login/oauth/access_token")) {
			if (options.tokenError) {
				return new Response(JSON.stringify({ error: "bad_verification_code" }), { status: 200 });
			}
			return new Response(JSON.stringify({ access_token: "gho_test_token" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		if (url.includes("api.github.com/user")) {
			return new Response(JSON.stringify(options.user ?? GH_USER), {
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
			redirectTo: "http://localhost:5173/",
			expiresAt: Date.now() + 600_000,
		}),
	);
}

describe("GET /api/auth/login", () => {
	test("redirects to GitHub and stores the state in KV", async () => {
		const ctx = createTestContext();
		const res = await ctx.app.request("/api/auth/login?redirect_to=%2F", {}, ctx.env);
		expect(res.status).toBe(302);

		const location = res.headers.get("Location") ?? "";
		expect(location).toContain("https://github.com/login/oauth/authorize");
		const state = new URL(location).searchParams.get("state");
		expect(state).toBeTruthy();

		const stored = await ctx.env.KV_STORE.get(`oauth:${state}`);
		expect(stored).not.toBeNull();
	});

	test("rejects a redirect target on a different origin", async () => {
		const ctx = createTestContext();
		const res = await ctx.app.request(
			"/api/auth/login?redirect_to=https%3A%2F%2Fevil.example%2F",
			{},
			ctx.env,
		);
		expect(res.status).toBe(400);
	});
});

describe("GET /api/auth/me", () => {
	test("returns 401 without a session cookie", async () => {
		const ctx = createTestContext();
		const res = await ctx.app.request("/api/auth/me", {}, ctx.env);
		expect(res.status).toBe(401);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe("UNAUTHENTICATED");
	});
});

describe("GET /api/auth/callback", () => {
	test("rejects an unknown/expired state", async () => {
		const ctx = createTestContext();
		const res = await ctx.app.request(
			"/api/auth/callback?code=abc&state=unknown-state",
			{},
			ctx.env,
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: { code: string } };
		expect(body.error.code).toBe("INVALID_STATE");
	});

	test("rejects a GitHub account that is not the allowed one", async () => {
		const restore = mockGitHubFetch({
			user: { id: 99999, login: "intruder", name: null, avatar_url: null },
		});
		try {
			const ctx = createTestContext();
			await seedOAuthState(ctx, "state-token-123456");

			const res = await ctx.app.request(
				"/api/auth/callback?code=abc&state=state-token-123456",
				{},
				ctx.env,
			);
			expect(res.status).toBe(403);
			const body = (await res.json()) as { error: { code: string } };
			expect(body.error.code).toBe("FORBIDDEN");

			const row = ctx.sqlite.query("SELECT COUNT(*) AS n FROM users").get() as { n: number };
			expect(row.n).toBe(0);
		} finally {
			restore();
		}
	});

	test("logs in the allowed user, creates user + session rows and sets a cookie", async () => {
		const restore = mockGitHubFetch();
		try {
			const ctx = createTestContext();
			await seedOAuthState(ctx, "state-token-123456");

			const res = await ctx.app.request(
				"/api/auth/callback?code=abc&state=state-token-123456",
				{},
				ctx.env,
			);
			expect(res.status).toBe(302);
			expect(res.headers.get("Location")).toBe("http://localhost:5173/");

			const setCookie = res.headers.get("set-cookie") ?? "";
			expect(setCookie).toContain("rss_session=");
			expect(setCookie).toContain("HttpOnly");
			expect(setCookie).toContain("SameSite=Lax");

			const user = ctx.sqlite.query("SELECT github_id, github_login FROM users").get() as {
				github_id: number;
				github_login: string;
			};
			expect(user).toEqual({ github_id: 12345, github_login: "testuser" });

			const session = ctx.sqlite.query("SELECT user_id FROM sessions").get() as { user_id: number };
			expect(session.user_id).toBe(1);
		} finally {
			restore();
		}
	});
});

describe("session lifecycle", () => {
	async function login(ctx: TestContext): Promise<string> {
		await seedOAuthState(ctx, "state-token-123456");
		const res = await ctx.app.request(
			"/api/auth/callback?code=abc&state=state-token-123456",
			{},
			ctx.env,
		);
		const setCookie = res.headers.get("set-cookie") ?? "";
		return setCookie.split(";")[0]!.split("=")[1]!;
	}

	test("me returns the user when the session cookie is valid", async () => {
		const restore = mockGitHubFetch();
		try {
			const ctx = createTestContext();
			const token = await login(ctx);

			const res = await ctx.app.request(
				"/api/auth/me",
				{ headers: { Cookie: `rss_session=${token}` } },
				ctx.env,
			);
			expect(res.status).toBe(200);
			const body = (await res.json()) as { user: { githubLogin: string } };
			expect(body.user.githubLogin).toBe("testuser");
		} finally {
			restore();
		}
	});

	test("logout destroys the session and subsequent requests are 401", async () => {
		const restore = mockGitHubFetch();
		try {
			const ctx = createTestContext();
			const token = await login(ctx);

			const res = await ctx.app.request(
				"/api/auth/logout",
				{ method: "POST", headers: { Cookie: `rss_session=${token}` } },
				ctx.env,
			);
			expect(res.status).toBe(200);

			const n = ctx.sqlite.query("SELECT COUNT(*) AS n FROM sessions").get() as { n: number };
			expect(n.n).toBe(0);

			const me = await ctx.app.request(
				"/api/auth/me",
				{ headers: { Cookie: `rss_session=${token}` } },
				ctx.env,
			);
			expect(me.status).toBe(401);
		} finally {
			restore();
		}
	});
});
