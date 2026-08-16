import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { searchEntryList } from "../../server/db/index.ts";
import { createFeed, updateFeed } from "../../server/feeds/index.ts";

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

async function getEntries(
	ctx: ReturnType<typeof createTestContext>,
	token: string,
	qs: string,
): Promise<{
	items: { id: number; title: string; feedTitle: string }[];
	nextCursor: string | null;
}> {
	const res = await ctx.app.request(
		`/api/entries?${qs}`,
		{
			headers: { Cookie: `rss_session=${token}` },
		},
		ctx.env,
	);
	expect(res.status).toBe(200);
	return (await res.json()) as {
		items: { id: number; title: string; feedTitle: string }[];
		nextCursor: string | null;
	};
}

test("search filters the entry list by title", async () => {
	const restore = mockFeedFetch(rssFixture);
	try {
		const ctx = createTestContext();
		await createFeed(ctx.db, ctx.env.KV_STORE, { url: "https://example.com/feed.xml" });
		const token = await login(ctx);

		// Without a query: all entries.
		const all = await getEntries(ctx, token, "");
		expect(all.items).toHaveLength(2);

		// Matching search term.
		const hit = await getEntries(ctx, token, "q=Hello");
		expect(hit.items.map((i) => i.title)).toEqual(["Hello World"]);

		// No results.
		const miss = await getEntries(ctx, token, "q=zzzznothing");
		expect(miss.items).toHaveLength(0);
		expect(miss.nextCursor).toBeNull();
	} finally {
		restore();
	}
});

test("search works across content, author and feed title", async () => {
	const restore = mockFeedFetch(rssFixture);
	try {
		const ctx = createTestContext();
		await createFeed(ctx.db, ctx.env.KV_STORE, { url: "https://example.com/feed.xml" });
		const token = await login(ctx);

		// Content field ("Full article content" is indexed).
		const byContent = await getEntries(ctx, token, "q=article");
		expect(byContent.items.length).toBeGreaterThan(0);

		// Author field.
		const byAuthor = await getEntries(ctx, token, "q=Jane");
		expect(byAuthor.items.map((i) => i.title)).toEqual(["Hello World"]);

		// Feed title field.
		const byFeed = await getEntries(ctx, token, "q=Example+Feed");
		expect(byFeed.items).toHaveLength(2);
	} finally {
		restore();
	}
});

test("search combines with the feed filter", async () => {
	const restore = mockFeedFetch(rssFixture);
	try {
		const ctx = createTestContext();
		const feed = await createFeed(ctx.db, ctx.env.KV_STORE, {
			url: "https://example.com/feed.xml",
		});
		const token = await login(ctx);

		const res = await getEntries(ctx, token, `q=Hello&feedId=${feed.id}`);
		expect(res.items.map((i) => i.title)).toEqual(["Hello World"]);

		const miss = await getEntries(ctx, token, `q=zzzz&feedId=${feed.id}`);
		expect(miss.items).toHaveLength(0);
	} finally {
		restore();
	}
});

test("renaming a feed updates the FTS search index", async () => {
	const restore = mockFeedFetch(rssFixture);
	try {
		const ctx = createTestContext();
		const feed = await createFeed(ctx.db, ctx.env.KV_STORE, {
			url: "https://example.com/feed.xml",
		});
		const token = await login(ctx);

		// Rename the feed.
		await updateFeed(ctx.db, feed.id, { title: "Renamed Feed" });

		// Search by the NEW name via the API (feed_title in FTS is fresh).
		const byNewName = await getEntries(ctx, token, "q=Renamed");
		expect(byNewName.items).toHaveLength(2);
		expect(byNewName.items.every((i) => i.feedTitle === "Renamed Feed")).toBe(true);

		// The old name no longer matches the feed title.
		const byOldName = await getEntries(ctx, token, "q=Example+Feed");
		expect(byOldName.items).toHaveLength(0);
	} finally {
		restore();
	}
});

test("searchEntryList supports pagination via the rank cursor", async () => {
	const restore = mockFeedFetch(rssFixture);
	try {
		const ctx = createTestContext();
		await createFeed(ctx.db, ctx.env.KV_STORE, { url: "https://example.com/feed.xml" });

		const page1 = await searchEntryList(ctx.db, { query: "Example Feed", limit: 1 });
		expect(page1.items).toHaveLength(1);
		expect(page1.nextCursor).not.toBeNull();

		const page2 = await searchEntryList(ctx.db, {
			query: "Example Feed",
			limit: 1,
			cursor: page1.nextCursor ?? undefined,
		});
		expect(page2.items).toHaveLength(1);
		// No duplicates across pages.
		expect(page2.items[0]?.id).not.toBe(page1.items[0]?.id);
	} finally {
		restore();
	}
});
