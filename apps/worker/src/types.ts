/** Wire types mirroring the backend API responses. */

export interface User {
	id: number;
	githubId: number;
	githubLogin: string;
	name: string | null;
	avatarUrl: string | null;
}

export type FeedStatus = "ok" | "broken" | "paused";
export type FeedType = "rss" | "atom" | "json";

export interface FeedWithCounts {
	id: number;
	url: string;
	siteUrl: string | null;
	title: string;
	description: string | null;
	type: FeedType;
	faviconUrl: string | null;
	folderId: number | null;
	status: FeedStatus;
	errorCount: number;
	lastError: string | null;
	lastFetchedAt: string | null;
	addedAt: string;
	unreadCount: number;
	totalCount: number;
}

export interface Folder {
	id: number;
	name: string;
	position: number;
	feedCount: number;
	unreadCount: number;
}

export interface EntryListItem {
	id: number;
	title: string;
	url: string | null;
	author: string | null;
	summary: string | null;
	imageUrl: string | null;
	publishedAt: string | null;
	feedId: number;
	feedTitle: string;
	isRead: boolean;
	isArchived: boolean;
	isStarred: boolean;
}

export interface EntryDetail {
	id: number;
	title: string;
	url: string | null;
	author: string | null;
	summary: string | null;
	imageUrl: string | null;
	publishedAt: string | null;
	feed: { id: number; title: string; faviconUrl: string | null; siteUrl: string | null };
	content: string | null;
	isRead: boolean;
	isArchived: boolean;
	isStarred: boolean;
	tags: string[];
}

export interface SearchResultItem {
	entryId: number;
	title: string;
	url: string | null;
	author: string | null;
	feedTitle: string;
	publishedAt: string | null;
	titleSnippet: string;
	contentSnippet: string;
}

export interface Paginated<T> {
	items: T[];
	nextCursor: string | null;
}

export interface RefreshResult {
	feedId: number;
	outcome: "ok" | "not_modified" | "error";
	newEntries: number;
	durationMs: number;
	error: string | null;
}

export interface FeedDetailResponse {
	feed: FeedWithCounts;
}

export interface RefreshResponse {
	result: RefreshResult;
}
