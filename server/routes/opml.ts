import { Hono } from "hono";
import { HttpError } from "../errors.ts";
import { exportOpml, FeedError, importOpml } from "../feeds/index.ts";
import type { AppEnv } from "../types.ts";

export const opmlRoutes = new Hono<AppEnv>();

/** GET /api/opml/export — download subscriptions as OPML 2.0. */
opmlRoutes.get("/export", async (c) => {
	const xml = await exportOpml(c.get("db"));
	return c.text(xml, 200, {
		"Content-Type": "application/xml; charset=utf-8",
		"Content-Disposition": 'attachment; filename="rss-reader-feeds.opml"',
	});
});

/**
 * POST /api/opml/import — import an OPML document. Creates folders + feed
 * rows, then triggers the refresh workflow to fetch and ingest the new feeds.
 */
opmlRoutes.post("/import", async (c) => {
	const xml = await c.req.text();
	if (xml.trim().length === 0) {
		throw new HttpError(400, "EMPTY_OPML", "No OPML content provided");
	}
	try {
		const result = await importOpml(c.get("db"), xml);
		if (result.feedIds.length > 0) {
			await c.env.REFRESH_WORKFLOW.create({ params: { feedIds: result.feedIds } });
		}
		return c.json({ result });
	} catch (err) {
		if (err instanceof FeedError) throw new HttpError(400, err.code, err.message);
		throw err;
	}
});
