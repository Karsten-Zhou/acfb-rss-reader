import { createDb } from "@rss/database";
import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import { notFound, onError } from "./errors.ts";
import { dbMiddleware } from "./middleware/context.ts";
import { authRoutes } from "./routes/auth.ts";
import { entryRoutes } from "./routes/entries.ts";
import { faviconRoutes } from "./routes/favicon.ts";
import { feedRoutes } from "./routes/feeds.ts";
import { folderRoutes } from "./routes/folders.ts";
import { healthRoutes } from "./routes/health.ts";
import { opmlRoutes } from "./routes/opml.ts";
import { searchRoutes } from "./routes/search.ts";
import { settingsRoutes } from "./routes/settings.ts";
import type { AppEnv, Env } from "./types.ts";

/**
 * Build the Hono application for a given set of bindings/config.
 * The Worker shell creates this once per isolate.
 */
export function createApp(env: Env) {
	const db = createDb(env.DB);

	const app = new Hono<AppEnv>();

	app.use("*", honoLogger());
	app.use("*", secureHeaders());
	app.use("*", dbMiddleware(db));

	app.route("/api/health", healthRoutes);
	app.route("/api/auth", authRoutes);
	app.route("/api/feeds", feedRoutes);
	app.route("/api/folders", folderRoutes);
	app.route("/api/entries", entryRoutes);
	app.route("/api/search", searchRoutes);
	app.route("/api/opml", opmlRoutes);
	app.route("/api/settings", settingsRoutes);
	app.route("/api/favicon", faviconRoutes);

	app.notFound(notFound);
	app.onError(onError);

	return app;
}
