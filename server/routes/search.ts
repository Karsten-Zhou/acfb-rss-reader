import { Hono } from "hono";
import { paginationQuerySchema } from "../../shared/index.ts";
import { searchEntries } from "../db/index.ts";

import type { AppEnv } from "../types.ts";

export const searchRoutes = new Hono<AppEnv>();

/** GET /api/search?q=... — full-text search over entries. */
searchRoutes.get("/", async (c) => {
	const query = paginationQuerySchema.parse(c.req.query());
	const q = (c.req.query("q") ?? "").trim();
	if (!q) return c.json({ items: [], nextCursor: null });

	const page = await searchEntries(c.get("db"), {
		query: q,
		limit: query.limit,
		cursor: query.cursor,
	});
	return c.json(page);
});
