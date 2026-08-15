import { sql } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../types.ts";

export const healthRoutes = new Hono<AppEnv>();

/** GET /api/health — liveness + DB connectivity probe. */
healthRoutes.get("/", async (c) => {
	const db = c.get("db");
	const startedAt = Date.now();
	try {
		await db.run(sql`SELECT 1`);
		return c.json({
			ok: true,
			service: "rss-reader",
			database: "ok",
			latencyMs: Date.now() - startedAt,
			timestamp: new Date().toISOString(),
		});
	} catch {
		return c.json(
			{
				ok: false,
				service: "rss-reader",
				database: "error",
				latencyMs: Date.now() - startedAt,
				timestamp: new Date().toISOString(),
			},
			503,
		);
	}
});
