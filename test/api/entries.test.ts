import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { createFeed } from "../../server/feeds/index.ts";

import { createTestContext } from "./helpers.ts";

const rssFixture = readFileSync(new URL("../feeds/fixtures/rss.xml", import.meta.url), "utf8");

function mockFeedFetch(body: string): () => void {
	const original = globalThis.fetch;
	const fetchGlobal = globalThis as unknown as { fetch: typeof fetch };
	fetchGlobal.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
		const url =
			typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
		if (url.includes("example.com")) {
			return new Response(body, {
				status: 200,
				headers: { "Content-Type": "application/rss+xml", ETag: '"abc123"' },
			});
		}
		if (url.includes("/login/oauth/access_token")) {
			return new Response(JSON.stringify({ access_token: "gho_test_token" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		if (url.includes("api.github.com/user")) {
			return new Response(
				JSON.stringify({ id: 12345, login: "testuser", name: "Test User", avatar_url: null }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}
		throw new Error(`Unexpected fetch call: ${url}`);
	}) as typeof fetch;
	return () => {
		fetchGlobal.fetch = original;
	};
}

test("createFeed subscribes and ingests entries", async () => {
	const restore = mockFeedFetch(rssFixture);
	try {
		const ctx = createTestContext();
		const feed = await createFeed(ctx.db, ctx.env.KV_STORE, {
			url: "https://example.com/feed.xml",
		});

		expect(feed.title).toBe("Example Feed");
		expect(feed.status).toBe("ok");

		const entries = ctx.sqlite.query("SELECT COUNT(*) AS n FROM entries").get() as { n: number };
		expect(entries.n).toBe(2);

		const readStatuses = ctx.sqlite.query("SELECT COUNT(*) AS n FROM read_status").get() as {
			n: number;
		};
		expect(readStatuses.n).toBe(2);
	} finally {
		restore();
	}
});

test("listing entries returns ingested entries with flags", async () => {
	const restore = mockFeedFetch(rssFixture);
	try {
		const ctx = createTestContext();
		await createFeed(ctx.db, ctx.env.KV_STORE, { url: "https://example.com/feed.xml" });

		const res = await ctx.app.request("/api/entries", {}, ctx.env);
		expect(res.status).toBe(401); // not authenticated

		// Authenticate as the test user, then list.
		const token = await login(ctx);
		const list = await ctx.app.request(
			"/api/entries",
			{ headers: { Cookie: `rss_session=${token}` } },
			ctx.env,
		);
		expect(list.status).toBe(200);
		const body = (await list.json()) as {
			items: { id: number; isRead: boolean }[];
			nextCursor: string | null;
		};
		expect(body.items).toHaveLength(2);
		expect(body.items.every((item) => item.isRead === false)).toBe(true);
	} finally {
		restore();
	}
});

async function login(ctx: ReturnType<typeof createTestContext>): Promise<string> {
	const state = "state-token-123456";
	await ctx.env.KV_STORE.put(
		`oauth:${state}`,
		JSON.stringify({
			state,
			redirectTo: "http://localhost:8787/",
			expiresAt: Date.now() + 600_000,
		}),
	);
	const res = await ctx.app.request(`/api/auth/callback?code=abc&state=${state}`, {}, ctx.env);
	const setCookie = res.headers.get("set-cookie") ?? "";
	return setCookie.split(";")[0]!.split("=")[1]!;
}

/** Fetch an entry's detail and read+archive flags via the API. */
async function entryDetail(
	ctx: ReturnType<typeof createTestContext>,
	token: string,
	entryId: number,
): Promise<{ isRead: boolean; isArchived: boolean; isStarred: boolean }> {
	const res = await ctx.app.request(
		`/api/entries/${entryId}`,
		{
			headers: { Cookie: `rss_session=${token}` },
		},
		ctx.env,
	);
	expect(res.status).toBe(200);
	const body = (await res.json()) as {
		entry: { isRead: boolean; isArchived: boolean; isStarred: boolean };
	};
	return body.entry;
}

/** PATCH a single flag and assert the response is ok. */
async function patchFlags(
	ctx: ReturnType<typeof createTestContext>,
	token: string,
	entryId: number,
	flags: Record<string, boolean>,
): Promise<void> {
	const res = await ctx.app.request(
		`/api/entries/${entryId}`,
		{
			method: "PATCH",
			headers: { Cookie: `rss_session=${token}`, "Content-Type": "application/json" },
			body: JSON.stringify(flags),
		},
		ctx.env,
	);
	expect(res.status).toBe(200);
}

test("flag mutation is idempotent and does not reset unrelated flags", async () => {
	const restore = mockFeedFetch(rssFixture);
	try {
		const ctx = createTestContext();
		await createFeed(ctx.db, ctx.env.KV_STORE, {
			url: "https://example.com/feed.xml",
		});
		const token = await login(ctx);
		const first = ctx.sqlite.query("SELECT id FROM entries ORDER BY id LIMIT 1").get() as {
			id: number;
		};
		const entryId = first.id;

		// Mark read. Absence of a row means unread; this should create a read row.
		await patchFlags(ctx, token, entryId, { isRead: true });
		let d = await entryDetail(ctx, token, entryId);
		expect(d.isRead).toBe(true);
		expect(d.isArchived).toBe(false);

		// Now archive WITHOUT touching read. The read flag must be preserved.
		await patchFlags(ctx, token, entryId, { isArchived: true });
		d = await entryDetail(ctx, token, entryId);
		expect(d.isArchived).toBe(true);
		expect(d.isRead).toBe(true); // unchanged by the archive call

		// Un-archive + un-read individually; each must only affect its own flag.
		await patchFlags(ctx, token, entryId, { isArchived: false });
		d = await entryDetail(ctx, token, entryId);
		expect(d.isArchived).toBe(false);
		expect(d.isRead).toBe(true);

		await patchFlags(ctx, token, entryId, { isRead: false });
		d = await entryDetail(ctx, token, entryId);
		expect(d.isRead).toBe(false);
		expect(d.isArchived).toBe(false);

		// Star is a separate presence table; toggling it must not touch read/archive.
		await patchFlags(ctx, token, entryId, { isStarred: true });
		d = await entryDetail(ctx, token, entryId);
		expect(d.isStarred).toBe(true);
		expect(d.isRead).toBe(false);
		expect(d.isArchived).toBe(false);
	} finally {
		restore();
	}
});
