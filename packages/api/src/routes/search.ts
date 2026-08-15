import { searchEntries } from "@rss/database";
import { paginationQuerySchema } from "@rss/shared";
import { Hono } from "hono";

import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../types.ts";

export const searchRoutes = new Hono<AppEnv>();

/** GET /api/search?q=... — full-text search over entries. */
searchRoutes.get("/", requireAuth(), async (c) => {
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
