import { expect, test } from "bun:test";

import { createTestContext } from "./helpers.ts";

test("GET /api/health returns ok when the database is reachable", async () => {
	const { env, app } = createTestContext();
	const res = await app.request("/api/health", {}, env);
	expect(res.status).toBe(200);
	const body = (await res.json()) as { ok: boolean; service: string };
	expect(body.ok).toBe(true);
	expect(body.service).toBe("rss-reader");
});
