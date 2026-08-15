import type { App, Env } from "@rss/api";
import { createApp } from "@rss/api";

// The app (and its DB handle) is created once per isolate; bindings are
// stable within an isolate, so this is safe.
let app: App | null = null;

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		app ??= createApp(env);
		return app.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
