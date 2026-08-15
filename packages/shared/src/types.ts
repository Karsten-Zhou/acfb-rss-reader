/**
 * Shared wire-level types for the REST API.
 */

/** A machine-readable API error. */
export interface ApiErrorBody {
	error: {
		code: string;
		message: string;
		/** Optional structured details (e.g. Zod issues). */
		details?: unknown;
	};
}

/** A paginated list response, cursor-based. */
export interface Paginated<T> {
	items: T[];
	/** Opaque cursor for the next page, or null when there are no more items. */
	nextCursor: string | null;
}

/** Union of feed types we support. */
export type FeedType = "rss" | "atom" | "json";

/** Health status of a feed subscription. */
export type FeedStatus = "ok" | "broken" | "paused";

/** Convenience alias: a value that can be awaited. */
export type Awaitable<T> = T | Promise<T>;

/**
 * Parameters passed to the feed-refresh Workflow instance.
 * An empty `feedIds` array means "refresh all due feeds".
 */
export interface RefreshWorkflowParams {
	feedIds: number[];
	/** Optional `refresh_jobs` row id for tracking. */
	jobId?: number;
}
