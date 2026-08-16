import { eq } from "drizzle-orm";
import { Hono } from "hono";
import {
	createFeedSchema,
	idSchema,
	reorderFeedsSchema,
	resolveRsshubUrl,
	updateFeedSchema,
} from "../../shared/index.ts";
import { feeds } from "../db/index.ts";
import { HttpError } from "../errors.ts";
import {
	createFeed,
	deleteFeed,
	FeedError,
	getFeedDetail,
	listFeeds,
	refreshFeed,
	reorderFeeds,
	updateFeed,
} from "../feeds/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../types.ts";

export const feedRoutes = new Hono<AppEnv>();

/** GET /api/feeds — all subscriptions with unread/total counts. */
feedRoutes.get("/", requireAuth(), async (c) => {
	const result = await listFeeds(c.get("db"));
	return c.json({ feeds: result });
});

/** POST /api/feeds — validate, subscribe, and ingest a feed. */
feedRoutes.post("/", requireAuth(), async (c) => {
	const body = (await c.req.json()) as { url?: unknown; folderId?: unknown };
	const input = createFeedSchema.parse({
		...body,
		url: typeof body.url === "string" ? resolveRsshubUrl(body.url) : body.url,
	});
	try {
		const feed = await createFeed(c.get("db"), c.env.KV_STORE, input);
		return c.json({ feed }, 201);
	} catch (err) {
		if (err instanceof FeedError) throw new HttpError(400, err.code, err.message);
		throw err;
	}
});

/** PUT /api/feeds/reorder — persist the sidebar order. */
feedRoutes.put("/reorder", requireAuth(), async (c) => {
	const { ids } = reorderFeedsSchema.parse(await c.req.json());
	await reorderFeeds(c.get("db"), ids);
	return c.json({ ok: true });
});

/** GET /api/feeds/:id — feed detail with counts. */
feedRoutes.get("/:id", requireAuth(), async (c) => {
	const id = idSchema.parse(c.req.param("id"));
	const feed = await getFeedDetail(c.get("db"), id);
	if (!feed) throw new HttpError(404, "NOT_FOUND", "Feed not found");
	return c.json({ feed });
});

/** PATCH /api/feeds/:id — update title/url/folder. */
feedRoutes.patch("/:id", requireAuth(), async (c) => {
	const id = idSchema.parse(c.req.param("id"));
	const body = (await c.req.json()) as { title?: unknown; url?: unknown; folderId?: unknown };
	const input = updateFeedSchema.parse({
		...body,
		url: typeof body.url === "string" ? resolveRsshubUrl(body.url) : body.url,
	});
	try {
		const feed = await updateFeed(c.get("db"), id, input, c.env.KV_STORE);
		if (!feed) throw new HttpError(404, "NOT_FOUND", "Feed not found");
		return c.json({ feed });
	} catch (err) {
		if (err instanceof FeedError) throw new HttpError(400, err.code, err.message);
		throw err;
	}
});

/** DELETE /api/feeds/:id — unsubscribe. */
feedRoutes.delete("/:id", requireAuth(), async (c) => {
	const id = idSchema.parse(c.req.param("id"));
	const deleted = await deleteFeed(c.get("db"), id);
	if (!deleted) throw new HttpError(404, "NOT_FOUND", "Feed not found");
	return c.json({ ok: true });
});

/** POST /api/feeds/:id/refresh — refresh one feed now. */
feedRoutes.post("/:id/refresh", requireAuth(), async (c) => {
	const db = c.get("db");
	const id = idSchema.parse(c.req.param("id"));
	const feed = await db.query.feeds.findFirst({ where: eq(feeds.id, id) });
	if (!feed) throw new HttpError(404, "NOT_FOUND", "Feed not found");

	const result = await refreshFeed(db, c.env.KV_STORE, feed);
	return c.json({ result });
});
