import type { Hono } from "hono";
import type { RefreshWorkflowParams } from "../shared/index.ts";
import type { Database } from "./db/index.ts";

/**
 * Worker bindings and configuration. The Worker shell (`server/index.ts`)
 * supplies this from `wrangler.jsonc` + secrets.
 */
export interface Env {
	/** D1 database binding. */
	DB: D1Database;
	/** KV namespace: favicon cache, feed body cache. */
	KV_STORE: KVNamespace;
	/** Feed refresh Workflow binding. */
	REFRESH_WORKFLOW: Workflow<RefreshWorkflowParams>;
	/** Workers AI binding (used for article summaries). */
	AI: Ai;
	ENVIRONMENT: "development" | "production";
	/** Web Push VAPID public key (URL-safe base64). Served to the browser. */
	VAPID_PUBLIC_KEY: string;
	/** Web Push VAPID private key (URL-safe base64). Server-only secret. */
	VAPID_PRIVATE_KEY?: string;
	/** VAPID subject: a `mailto:` or `https://` URI identifying the app. */
	VAPID_SUBJECT?: string;
}

/** Values stored on the Hono context. */
export interface AppVariables {
	db: Database;
}

export type AppEnv = {
	Bindings: Env;
	Variables: AppVariables;
};

export type App = Hono<AppEnv>;
