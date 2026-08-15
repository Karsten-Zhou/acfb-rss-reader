import { FeedError } from "@rss/feeds";
import type { ErrorHandler, NotFoundHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { AppEnv } from "./types.ts";

/**
 * Error carrying an HTTP status, machine-readable code and optional details.
 * Throw from route handlers; the app-level `onError` renders it as JSON.
 */
export class HttpError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string,
		message: string,
		public readonly details?: unknown,
	) {
		super(message);
		this.name = "HttpError";
	}
}

export const onError: ErrorHandler<AppEnv> = (err, c) => {
	if (err instanceof HttpError) {
		return c.json(
			{ error: { code: err.code, message: err.message, details: err.details } },
			err.status as ContentfulStatusCode,
		);
	}
	// Feed fetch/parse/ingest errors surface as client errors.
	if (err instanceof FeedError) {
		return c.json({ error: { code: err.code, message: err.message } }, 400);
	}
	// Unexpected error: don't leak internals, but log everything.
	console.error(
		JSON.stringify({
			level: "error",
			message: "Unhandled error",
			error: err instanceof Error ? (err.stack ?? err.message) : String(err),
			timestamp: new Date().toISOString(),
		}),
	);
	return c.json(
		{ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
		500,
	);
};

export const notFound: NotFoundHandler<AppEnv> = (c) =>
	c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404);
