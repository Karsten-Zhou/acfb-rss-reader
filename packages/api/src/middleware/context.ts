import type { Database } from "@rss/database";
import type { Context, Next } from "hono";

import type { AppEnv } from "../types.ts";

/** Put the database handle on the context for all requests. */
export function dbMiddleware(db: Database) {
	return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
		c.set("db", db);
		return next();
	};
}
