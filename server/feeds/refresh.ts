import { eq, inArray, isNull, lte, or } from "drizzle-orm";
import { DEFAULT_REFRESH_INTERVAL_MS, FEED_MIN_REFRESH_INTERVAL_MS } from "../../shared/index.ts";
import { type Database, type Feed, feeds, fetchLogs } from "../db/index.ts";
import { notifyNewEntry } from "../notifications/index.ts";
import type { Env } from "../types.ts";

import { fetchFeedDocument } from "./fetch-document.ts";
import { ingestFeed } from "./ingest.ts";
import { parseFeedDocument } from "./parse.ts";
import type { RefreshFeedResult } from "./types.ts";

export function feedBodyCacheKey(url: string): string {
	return `feed-body:${url}`;
}

function nextFetchAt(): Date {
	return new Date(Date.now() + DEFAULT_REFRESH_INTERVAL_MS);
}

/** Feeds whose minimum refresh interval has elapsed. */
function isRefreshable(feed: Feed, now: number): boolean {
	return !feed.lastFetchedAt || now - feed.lastFetchedAt.getTime() >= FEED_MIN_REFRESH_INTERVAL_MS;
}

/** Refresh a single feed: fetch (conditional), parse, ingest, log. */
export async function refreshFeed(
	db: Database,
	kv: KVNamespace,
	feed: Feed,
	env?: Env,
): Promise<RefreshFeedResult> {
	const startedAt = Date.now();

	const result = await fetchFeedDocument({
		url: feed.url,
		etag: feed.etag,
		lastModified: feed.lastModified,
		kv,
		cacheKey: feedBodyCacheKey(feed.url),
	});

	if (result.kind === "not_modified") {
		const durationMs = Date.now() - startedAt;
		await db
			.update(feeds)
			.set({ lastFetchedAt: new Date(), nextFetchAt: nextFetchAt() })
			.where(eq(feeds.id, feed.id));
		await db.insert(fetchLogs).values({
			feedId: feed.id,
			status: "not_modified",
			durationMs,
		});
		return { feedId: feed.id, outcome: "not_modified", newEntries: 0, durationMs, error: null };
	}

	if (result.kind === "error") {
		const durationMs = Date.now() - startedAt;
		const errorCount = feed.errorCount + 1;
		await db
			.update(feeds)
			.set({
				status: errorCount >= 3 ? "broken" : feed.status,
				errorCount,
				lastError: result.error,
				lastFetchedAt: new Date(),
				nextFetchAt: nextFetchAt(),
			})
			.where(eq(feeds.id, feed.id));
		await db.insert(fetchLogs).values({
			feedId: feed.id,
			status: "error",
			httpStatus: result.httpStatus,
			durationMs,
			error: result.error,
		});
		return { feedId: feed.id, outcome: "error", newEntries: 0, durationMs, error: result.error };
	}

	// success (live or stale-cache)
	try {
		const parsed = parseFeedDocument(result.body, result.finalUrl || feed.url);
		const stats = await ingestFeed(db, feed.id, parsed);
		const durationMs = Date.now() - startedAt;
		await db
			.update(feeds)
			.set({
				siteUrl: parsed.siteUrl ?? feed.siteUrl,
				description: parsed.description ?? feed.description,
				type: parsed.feedType,
				etag: result.etag,
				lastModified: result.lastModified,
				lastFetchedAt: new Date(),
				nextFetchAt: nextFetchAt(),
				status: "ok",
				errorCount: 0,
				lastError: null,
			})
			.where(eq(feeds.id, feed.id));
		await db.insert(fetchLogs).values({
			feedId: feed.id,
			status: "success",
			httpStatus: result.httpStatus,
			durationMs,
			newEntries: stats.newEntries,
			etag: result.etag,
			lastModified: result.lastModified,
		});

		// Notify for genuinely-new articles discovered by a scheduled/manual
		// refresh of an existing feed. `ingestFeed` returns `inserted` only
		// for entries persisted just now; deduplication already happened. The
		// notification service enforces its own idempotency, so a retry can
		// never send a duplicate. New-feed/OPML first import does NOT call
		// this path, so historical backlogs are never notified.
		if (env && stats.inserted && stats.inserted.length > 0) {
			for (const entry of stats.inserted) {
				await notifyNewEntry(db, env, {
					entryId: entry.id,
					title: entry.title,
					url: entry.url,
					feedId: feed.id,
					feedTitle: feed.title,
				});
			}
		}

		return {
			feedId: feed.id,
			outcome: "ok",
			newEntries: stats.newEntries,
			durationMs,
			error: null,
		};
	} catch (err) {
		const durationMs = Date.now() - startedAt;
		const message = err instanceof Error ? err.message : String(err);
		const errorCount = feed.errorCount + 1;
		await db
			.update(feeds)
			.set({
				status: errorCount >= 3 ? "broken" : feed.status,
				errorCount,
				lastError: message,
				lastFetchedAt: new Date(),
				nextFetchAt: nextFetchAt(),
			})
			.where(eq(feeds.id, feed.id));
		await db.insert(fetchLogs).values({
			feedId: feed.id,
			status: "error",
			httpStatus: result.httpStatus,
			durationMs,
			error: message,
		});
		return { feedId: feed.id, outcome: "error", newEntries: 0, durationMs, error: message };
	}
}

/** Run an async mapper over items with bounded concurrency. */
export async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		for (;;) {
			const index = nextIndex++;
			if (index >= items.length) return;
			results[index] = await fn(items[index]!);
		}
	});
	await Promise.all(workers);
	return results;
}

/**
 * Refresh many feeds with bounded concurrency, honoring the per-feed minimum
 * interval and writing one fetch_log per feed.
 */
export async function refreshFeeds(
	db: Database,
	kv: KVNamespace,
	feedIds: number[],
	options: { concurrency?: number; env?: Env } = {},
): Promise<RefreshFeedResult[]> {
	if (feedIds.length === 0) return [];

	const feedRows = await db.select().from(feeds).where(inArray(feeds.id, feedIds)).all();
	const now = Date.now();
	const eligible = feedRows.filter((feed) => isRefreshable(feed, now));

	const results = await mapWithConcurrency(eligible, options.concurrency ?? 5, async (feed) =>
		refreshFeed(db, kv, feed, options.env),
	);
	return results;
}

/** Feed ids that are due for a scheduled refresh (cron). */
export async function getDueFeedIds(
	db: Database,
	options: { limit?: number } = {},
): Promise<number[]> {
	const now = new Date();
	const rows = await db
		.select({ id: feeds.id })
		.from(feeds)
		.where(or(isNull(feeds.nextFetchAt), lte(feeds.nextFetchAt, now)))
		.limit(options.limit ?? 100);
	return rows.map((row) => row.id);
}
