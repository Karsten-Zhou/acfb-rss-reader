import { type Database, entries, type Feed, feedFolders, feeds, readStatus } from "@rss/database";
import type { FeedType } from "@rss/shared";
import { guessFaviconUrl, isLocalhost, normalizeUrl } from "@rss/shared";
import { count, eq, sql } from "drizzle-orm";

import { FeedError } from "./errors.ts";
import { fetchFeedDocument } from "./fetch-document.ts";
import { ingestFeed } from "./ingest.ts";
import { parseFeedDocument } from "./parse.ts";
import { feedBodyCacheKey } from "./refresh.ts";
import type { FeedWithCounts, ParsedFeed } from "./types.ts";

export interface CreateFeedInput {
	url: string;
	folderId?: number | null;
}

export interface UpdateFeedInput {
	title?: string;
	folderId?: number | null;
}

export interface FolderWithCounts {
	id: number;
	name: string;
	position: number;
	createdAt: Date;
	feedCount: number;
	unreadCount: number;
}

/**
 * Validate and subscribe to a feed. Fetches + parses once to confirm the
 * feed works and to capture metadata, then ingests its entries immediately.
 */
export async function createFeed(
	db: Database,
	kv: KVNamespace,
	input: CreateFeedInput,
): Promise<Feed> {
	const url = normalizeUrl(input.url);
	if (!url) throw new FeedError("Invalid feed URL", "INVALID_URL");
	if (isLocalhost(url)) throw new FeedError("Local addresses are not allowed", "INVALID_URL");

	const existing = await db.query.feeds.findFirst({ where: eq(feeds.url, url) });
	if (existing) throw new FeedError("Feed is already subscribed", "DUPLICATE_FEED");

	const fetched = await fetchFeedDocument({ url, kv, cacheKey: feedBodyCacheKey(url) });
	if (fetched.kind === "error") {
		throw new FeedError(`Could not fetch feed: ${fetched.error}`, "FETCH_FAILED");
	}
	if (fetched.kind === "not_modified") {
		throw new FeedError("Feed returned no content", "FETCH_FAILED");
	}

	let parsed: ParsedFeed;
	try {
		parsed = parseFeedDocument(fetched.body, fetched.finalUrl || url);
	} catch (err) {
		throw new FeedError(err instanceof Error ? err.message : String(err), "PARSE_FAILED");
	}
	if (parsed.entries.length === 0) {
		throw new FeedError("Feed contains no entries", "EMPTY_FEED");
	}

	const created = await db
		.insert(feeds)
		.values({
			url,
			siteUrl: parsed.siteUrl,
			title: parsed.title,
			description: parsed.description,
			type: parsed.feedType,
			faviconUrl: guessFaviconUrl(url, parsed.siteUrl),
			folderId: input.folderId ?? null,
			etag: fetched.etag,
			lastModified: fetched.lastModified,
			lastFetchedAt: new Date(),
			status: "ok",
		})
		.returning()
		.get();
	if (!created) throw new FeedError("Failed to create feed", "CREATE_FAILED");

	await ingestFeed(db, created.id, parsed);
	return created;
}

/** All feeds with unread/total counts, ordered by title. */
export async function listFeeds(db: Database): Promise<FeedWithCounts[]> {
	const rows = await db
		.select({
			id: feeds.id,
			url: feeds.url,
			siteUrl: feeds.siteUrl,
			title: feeds.title,
			description: feeds.description,
			type: feeds.type,
			faviconUrl: feeds.faviconUrl,
			folderId: feeds.folderId,
			status: feeds.status,
			errorCount: feeds.errorCount,
			lastError: feeds.lastError,
			lastFetchedAt: feeds.lastFetchedAt,
			addedAt: feeds.addedAt,
			unreadCount: sql<number>`COALESCE(SUM(CASE WHEN ${readStatus.isRead} = 0 THEN 1 ELSE 0 END), 0)`,
			totalCount: count(entries.id).as("total_count"),
		})
		.from(feeds)
		.leftJoin(entries, eq(entries.feedId, feeds.id))
		.leftJoin(readStatus, eq(readStatus.entryId, entries.id))
		.groupBy(feeds.id)
		.orderBy(sql`${feeds.title} COLLATE NOCASE`);

	return rows.map((row) => ({
		...row,
		type: row.type as FeedType,
		unreadCount: Number(row.unreadCount),
		totalCount: Number(row.totalCount),
	}));
}

/** One feed with unread/total counts and its latest fetch log. */
export async function getFeedDetail(db: Database, id: number): Promise<FeedWithCounts | null> {
	const row = await db
		.select({
			id: feeds.id,
			url: feeds.url,
			siteUrl: feeds.siteUrl,
			title: feeds.title,
			description: feeds.description,
			type: feeds.type,
			faviconUrl: feeds.faviconUrl,
			folderId: feeds.folderId,
			status: feeds.status,
			errorCount: feeds.errorCount,
			lastError: feeds.lastError,
			lastFetchedAt: feeds.lastFetchedAt,
			addedAt: feeds.addedAt,
			unreadCount: sql<number>`COALESCE(SUM(CASE WHEN ${readStatus.isRead} = 0 THEN 1 ELSE 0 END), 0)`,
			totalCount: count(entries.id).as("total_count"),
		})
		.from(feeds)
		.leftJoin(entries, eq(entries.feedId, feeds.id))
		.leftJoin(readStatus, eq(readStatus.entryId, entries.id))
		.where(eq(feeds.id, id))
		.groupBy(feeds.id)
		.get();

	if (!row) return null;
	return {
		...row,
		type: row.type as FeedType,
		unreadCount: Number(row.unreadCount),
		totalCount: Number(row.totalCount),
	};
}

export async function updateFeed(
	db: Database,
	id: number,
	input: UpdateFeedInput,
): Promise<Feed | null> {
	if (input.folderId !== undefined && input.folderId !== null) {
		const folder = await db.query.feedFolders.findFirst({
			where: eq(feedFolders.id, input.folderId),
		});
		if (!folder) throw new FeedError("Folder not found", "NOT_FOUND");
	}
	const patch: Partial<Pick<Feed, "title" | "folderId">> = {};
	if (input.title !== undefined) patch.title = input.title;
	if (input.folderId !== undefined) patch.folderId = input.folderId;

	const updated = await db.update(feeds).set(patch).where(eq(feeds.id, id)).returning().get();
	return updated ?? null;
}

export async function deleteFeed(db: Database, id: number): Promise<boolean> {
	const result = await db.delete(feeds).where(eq(feeds.id, id)).returning({ id: feeds.id }).get();
	return result !== undefined;
}

// --- Folders ---

export async function listFolders(db: Database): Promise<FolderWithCounts[]> {
	return db
		.select({
			id: feedFolders.id,
			name: feedFolders.name,
			position: feedFolders.position,
			createdAt: feedFolders.createdAt,
			feedCount: count(feeds.id),
			unreadCount: sql<number>`COALESCE(SUM(CASE WHEN ${readStatus.isRead} = 0 THEN 1 ELSE 0 END), 0)`,
		})
		.from(feedFolders)
		.leftJoin(feeds, eq(feeds.folderId, feedFolders.id))
		.leftJoin(entries, eq(entries.feedId, feeds.id))
		.leftJoin(readStatus, eq(readStatus.entryId, entries.id))
		.groupBy(feedFolders.id)
		.orderBy(feedFolders.position);
}

export async function createFolder(
	db: Database,
	name: string,
): Promise<{ id: number; name: string }> {
	const maxPos = await db
		.select({ p: sql<number>`COALESCE(MAX(${feedFolders.position}), 0)` })
		.from(feedFolders)
		.get();
	const folder = await db
		.insert(feedFolders)
		.values({ name, position: Number(maxPos?.p ?? 0) + 1 })
		.returning({ id: feedFolders.id, name: feedFolders.name })
		.get();
	if (!folder) throw new FeedError("Failed to create folder", "CREATE_FAILED");
	return folder;
}

export async function renameFolder(
	db: Database,
	id: number,
	name: string,
): Promise<{ id: number; name: string } | null> {
	const [folder] = await db
		.update(feedFolders)
		.set({ name })
		.where(eq(feedFolders.id, id))
		.returning({ id: feedFolders.id, name: feedFolders.name });
	return folder ?? null;
}

export async function deleteFolder(db: Database, id: number): Promise<boolean> {
	// Unassign feeds before deleting the folder.
	await db.update(feeds).set({ folderId: null }).where(eq(feeds.folderId, id));
	const result = await db
		.delete(feedFolders)
		.where(eq(feedFolders.id, id))
		.returning({ id: feedFolders.id })
		.get();
	return result !== undefined;
}
