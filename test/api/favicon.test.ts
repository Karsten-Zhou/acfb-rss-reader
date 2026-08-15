import { expect, test } from "bun:test";

import { createTestContext } from "./helpers.ts";

const FAVICON_URL = encodeURIComponent("https://example.com/favicon.ico");
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function mockFetch(handler: () => Response | Promise<Response>): () => void {
	const original = globalThis.fetch;
	const g = globalThis as unknown as { fetch: typeof fetch };
	g.fetch = (async () => handler()) as typeof fetch;
	return () => {
		g.fetch = original;
	};
}

test("GET /api/favicon rejects invalid and localhost URLs", async () => {
	const ctx = createTestContext();

	const notUrl = await ctx.app.request("/api/favicon?url=not-a-url", {}, ctx.env);
	expect(notUrl.status).toBe(400);

	const localhost = await ctx.app.request(
		`/api/favicon?url=${encodeURIComponent("http://127.0.0.1/favicon.ico")}`,
		{},
		ctx.env,
	);
	expect(localhost.status).toBe(400);
});

test("GET /api/favicon fetches, caches in KV, and serves the cache on the next request", async () => {
	const ctx = createTestContext();
	let fetchCount = 0;
	const restore = mockFetch(() => {
		fetchCount += 1;
		return new Response(PNG_BYTES, {
			status: 200,
			headers: { "Content-Type": "image/png" },
		});
	});
	try {
		const first = await ctx.app.request(`/api/favicon?url=${FAVICON_URL}`, {}, ctx.env);
		expect(first.status).toBe(200);
		expect(first.headers.get("content-type")).toBe("image/png");
		expect(fetchCount).toBe(1);

		// Second request should be served from KV without another fetch.
		const second = await ctx.app.request(`/api/favicon?url=${FAVICON_URL}`, {}, ctx.env);
		expect(second.status).toBe(200);
		expect(fetchCount).toBe(1);
	} finally {
		restore();
	}
});

test("GET /api/favicon returns 502 when the upstream fetch fails", async () => {
	const ctx = createTestContext();
	const restore = mockFetch(() => {
		throw new Error("network down");
	});
	try {
		const res = await ctx.app.request(`/api/favicon?url=${FAVICON_URL}`, {}, ctx.env);
		expect(res.status).toBe(502);
	} finally {
		restore();
	}
});
