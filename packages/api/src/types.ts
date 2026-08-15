import type { Database, Session, User } from "@rss/database";
import type { RefreshWorkflowParams } from "@rss/shared";
import type { Hono } from "hono";

/**
 * Worker bindings and configuration. The Worker shell (`apps/worker`)
 * supplies this from `wrangler.jsonc` + secrets; the API package only
 * declares the shape.
 */
export interface Env {
	/** D1 database binding. */
	DB: D1Database;
	/** KV namespace: favicon cache, OAuth state, feed body cache. */
	KV_STORE: KVNamespace;
	/** Feed refresh Workflow binding. */
	REFRESH_WORKFLOW: Workflow<RefreshWorkflowParams>;
	/** GitHub OAuth App credentials. */
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	/** The only GitHub user id allowed to sign in. */
	ALLOWED_GITHUB_USER_ID: string;
	/** Public origin of the app (used for redirects and cookie scope). */
	APP_ORIGIN: string;
	ENVIRONMENT: "development" | "production";
}

/** Values stored on the Hono context. */
export interface AppVariables {
	db: Database;
	/** Present only after `requireAuth()` middleware. */
	user: User;
	session: Session;
}

export type AppEnv = {
	Bindings: Env;
	Variables: AppVariables;
};

export type App = Hono<AppEnv>;
