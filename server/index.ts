import { createApp } from "./app.ts";
import { createDb } from "./db/index.ts";
import { getDueFeedIds } from "./feeds/index.ts";
import { logger } from "./logging.ts";
import type { App, Env } from "./types.ts";

import { RefreshWorkflow } from "./workflows/refresh-workflow.ts";

export { RefreshWorkflow };

// The app (and its DB handle) is created once per isolate; bindings are
// stable within an isolate, so this is safe.
let app: App | null = null;

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		app ??= createApp(env);
		return app.fetch(request, env, ctx);
	},

	/** Cron trigger: refresh all due feeds via the durable workflow. */
	async scheduled(
		_controller: ScheduledController,
		env: Env,
		_ctx: ExecutionContext,
	): Promise<void> {
		const db = createDb(env.DB);
		const feedIds = await getDueFeedIds(db, { limit: 100 });
		if (feedIds.length === 0) {
			logger.info("Scheduled refresh: no feeds due");
			return;
		}
		await env.REFRESH_WORKFLOW.create({ params: { feedIds } });
		logger.info("Scheduled refresh triggered", { feeds: feedIds.length });
	},
} satisfies ExportedHandler<Env>;
