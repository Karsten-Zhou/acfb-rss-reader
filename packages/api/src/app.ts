import { createDb } from "@rss/database";
import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import { notFound, onError } from "./errors.ts";
import { dbMiddleware } from "./middleware/context.ts";
import { authRoutes } from "./routes/auth.ts";
import { healthRoutes } from "./routes/health.ts";
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

	app.notFound(notFound);
	app.onError(onError);

	return app;
}
