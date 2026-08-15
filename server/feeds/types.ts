import type { FeedType } from "../../shared/index.ts";

/** A single normalized entry extracted from a feed. */
export interface ParsedEntry {
	/** Stable dedupe key (feed guid/id, or a derived hash). */
	guid: string;
	title: string;
	url: string | null;
	author: string | null;
	/** Plain-text preview. */
	summary: string | null;
	/** Raw HTML content as published by the feed. */
	content: string | null;
	imageUrl: string | null;
	publishedAt: Date | null;
	updatedAt: Date | null;
}

/** A fully parsed and normalized feed. */
export interface ParsedFeed {
	title: string;
	description: string | null;
	siteUrl: string | null;
	feedType: FeedType;
	entries: ParsedEntry[];
}

export interface IngestStats {
	newEntries: number;
	totalEntries: number;
}

export type RefreshOutcome = "ok" | "not_modified" | "error";

export interface RefreshFeedResult {
	feedId: number;
	outcome: RefreshOutcome;
	newEntries: number;
	durationMs: number;
	error: string | null;
}

/** A feed row together with its unread/total counts for the UI. */
export interface FeedWithCounts {
	id: number;
	url: string;
	siteUrl: string | null;
	title: string;
	description: string | null;
	type: FeedType;
	faviconUrl: string | null;
	folderId: number | null;
	status: "ok" | "broken" | "paused";
	errorCount: number;
	lastError: string | null;
	lastFetchedAt: Date | null;
	addedAt: Date;
	unreadCount: number;
	totalCount: number;
}
