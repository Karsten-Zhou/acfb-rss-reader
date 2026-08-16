import { eq, sql } from "drizzle-orm";

import type { Database } from "./client.ts";
import { entriesFts } from "./schema/search.ts";

/**
 * Full-text search over entries using SQLite FTS5 (Cloudflare-native, no
 * external service).
 *
 * The `entries_fts` virtual table is created in the initial migration (raw
 * SQL) and maintained by the feeds pipeline via the index helpers below.
 */

export interface SearchResult {
	entryId: number;
	title: string;
	url: string | null;
	author: string | null;
	feedTitle: string;
	publishedAt: string | null;
	/** Highlighted title snippet from FTS5. */
	titleSnippet: string;
	/** Highlighted content snippet from FTS5. */
	contentSnippet: string;
}

export interface SearchOptions {
	query: string;
	limit: number;
	/** Opaque cursor from a previous page. */
	cursor?: string;
}

export interface SearchPage {
	items: SearchResult[];
	nextCursor: string | null;
}

/** FTS5 special characters that must be escaped inside quoted tokens. */
const FTS_ESCAPE_RE = /"/g;

function escapeToken(token: string): string {
	// FTS5 supports escaping double quotes inside quoted strings by doubling them.
	return `"${token.replace(FTS_ESCAPE_RE, '""')}"`;
}

/**
 * Build an FTS5 MATCH expression from a free-text query.
 * Tokens are AND-ed by default; quoting makes each token a phrase match.
 */
export function buildMatchExpression(query: string): string {
	const tokens = query
		.trim()
		.split(/\s+/)
		.filter((t) => t.length > 0);
	return tokens.map(escapeToken).join(" ");
}

interface FtsRow {
	entry_id: number;
	rank: number;
	title: string;
	url: string | null;
	author: string | null;
	feed_title: string;
	published_at: string | null;
	title_snippet: string;
	content_snippet: string;
}

/** Search entries across title, content, author, feed title and tags. */
export async function searchEntries(db: Database, options: SearchOptions): Promise<SearchPage> {
	const { query, limit } = options;
	const match = buildMatchExpression(query);
	if (match.length === 0) return { items: [], nextCursor: null };

	// Cursor decodes to { rank, entryId } for stable rank-ordered pagination.
	let cursorRank: number | null = null;
	let cursorEntryId: number | null = null;
	if (options.cursor) {
		try {
			const parsed = JSON.parse(atob(options.cursor)) as { r: number; id: number };
			cursorRank = parsed.r;
			cursorEntryId = parsed.id;
		} catch {
			return { items: [], nextCursor: null };
		}
	}

	const rows = await db.all<FtsRow>(sql`
      SELECT
        f.entry_id,
        f.rank AS rank,
        e.title,
        e.url,
        e.author,
        f.feed_title,
        e.published_at,
        snippet(f, 1, '<mark>', '</mark>', '…', 12) AS title_snippet,
        snippet(f, 2, '<mark>', '</mark>', '…', 24) AS content_snippet
      FROM entries_fts f
      JOIN entries e ON e.id = f.entry_id
      WHERE entries_fts MATCH ${match}
        AND (
          ${cursorRank == null} OR
          f.rank > ${cursorRank} OR
          (f.rank = ${cursorRank} AND f.entry_id < ${cursorEntryId})
        )
      ORDER BY f.rank, f.entry_id DESC
      LIMIT ${limit + 1}
    `);

	const hasMore = rows.length > limit;
	const pageRows = hasMore ? rows.slice(0, limit) : rows;
	const last = pageRows.at(-1);

	const items: SearchResult[] = pageRows.map((row) => ({
		entryId: row.entry_id,
		title: row.title,
		url: row.url,
		author: row.author,
		feedTitle: row.feed_title,
		publishedAt: row.published_at,
		titleSnippet: row.title_snippet,
		contentSnippet: row.content_snippet,
	}));

	const nextCursor =
		last !== undefined ? btoa(JSON.stringify({ r: last.rank, id: last.entry_id })) : null;

	return { items, nextCursor };
}

/**
 * Index (or re-index) one entry in the FTS table.
 * FTS5 virtual tables have no unique constraint on `entry_id`, so we use a
 * delete-then-insert to keep the index idempotent.
 */
export async function indexEntry(
	db: Database,
	params: {
		entryId: number;
		title: string;
		content: string;
		author: string | null;
		feedTitle: string;
		tags: string[];
	},
): Promise<void> {
	const { entryId, title, content, author, feedTitle, tags } = params;
	await db.delete(entriesFts).where(eq(entriesFts.entryId, entryId));
	await db.insert(entriesFts).values({
		entryId,
		title,
		content,
		author: author ?? "",
		feedTitle,
		tags: tags.join(" "),
	});
}

/** Remove an entry from the FTS index. */
export async function unindexEntry(db: Database, entryId: number): Promise<void> {
	await db.delete(entriesFts).where(eq(entriesFts.entryId, entryId));
}

/**
 * Row shape for FTS search combined with the entry-list response fields
 * (flags + feed metadata). Mirrors the non-search list row.
 */
export interface EntryListSearchRow {
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

export interface EntryListSearchOptions {
	query: string;
	limit: number;
	/** Opaque rank cursor from a previous page. */
	cursor?: string;
	feedId?: number;
	folderId?: number;
	starred?: boolean;
	unread?: boolean;
	/** true = archived only, false = hide archived, null/undefined = both. */
	archived?: boolean | null;
}

interface EntryListFtsRow {
	id: number;
	title: string;
	url: string | null;
	author: string | null;
	summary: string | null;
	image_url: string | null;
	published_at: number | null;
	feed_id: number;
	feed_title: string;
	is_read: number;
	archived: number;
	is_starred: number;
	rank: number;
}

/**
 * Full-text search over entries that returns the same shape as the entry
 * list endpoint, so the list view can be filtered by a search term without
 * changing the response contract. View filters (feed/folder/starred/unread/
 * archived) are applied as extra predicates on the joined tables.
 */
export async function searchEntryList(
	db: Database,
	options: EntryListSearchOptions,
): Promise<{ items: EntryListSearchRow[]; nextCursor: string | null }> {
	const match = buildMatchExpression(options.query);
	if (match.length === 0) return { items: [], nextCursor: null };

	// Cursor decodes to { rank, entryId } for stable rank-ordered pagination.
	let cursorRank: number | null = null;
	let cursorEntryId: number | null = null;
	if (options.cursor) {
		try {
			const parsed = JSON.parse(atob(options.cursor)) as { r: number; id: number };
			cursorRank = parsed.r;
			cursorEntryId = parsed.id;
		} catch {
			return { items: [], nextCursor: null };
		}
	}

	const conditions = [sql`entries_fts MATCH ${match}`];
	if (cursorRank !== null && cursorEntryId !== null) {
		conditions.push(
			sql`(f.rank > ${cursorRank} OR (f.rank = ${cursorRank} AND f.entry_id < ${cursorEntryId}))`,
		);
	}
	if (options.feedId !== undefined) conditions.push(sql`e.feed_id = ${options.feedId}`);
	if (options.folderId !== undefined) conditions.push(sql`fd.folder_id = ${options.folderId}`);
	if (options.starred) conditions.push(sql`s.entry_id IS NOT NULL`);
	if (options.unread) conditions.push(sql`COALESCE(rs.is_read, 0) = 0`);
	if (options.archived === true) conditions.push(sql`COALESCE(rs.archived, 0) = 1`);
	else if (options.archived === false) conditions.push(sql`COALESCE(rs.archived, 0) = 0`);

	const rows = await db.all<EntryListFtsRow>(sql`
      SELECT
        e.id,
        e.title,
        e.url,
        e.author,
        e.summary,
        e.image_url,
        e.published_at,
        e.feed_id,
        fd.title AS feed_title,
        COALESCE(rs.is_read, 0) AS is_read,
        COALESCE(rs.archived, 0) AS archived,
        s.entry_id IS NOT NULL AS is_starred,
        f.rank AS rank
      FROM entries_fts f
      JOIN entries e ON e.id = f.entry_id
      JOIN feeds fd ON fd.id = e.feed_id
      LEFT JOIN read_status rs ON rs.entry_id = e.id
      LEFT JOIN starred s ON s.entry_id = e.id
      WHERE ${sql.join(conditions, sql.raw(" AND "))}
      ORDER BY f.rank, f.entry_id DESC
      LIMIT ${options.limit + 1}
    `);

	const hasMore = rows.length > options.limit;
	const pageRows = hasMore ? rows.slice(0, options.limit) : rows;
	const last = pageRows.at(-1);

	const items: EntryListSearchRow[] = pageRows.map((row) => ({
		id: row.id,
		title: row.title,
		url: row.url,
		author: row.author,
		summary: row.summary,
		imageUrl: row.image_url,
		publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
		feedId: row.feed_id,
		feedTitle: row.feed_title,
		isRead: Boolean(row.is_read),
		isArchived: Boolean(row.archived),
		isStarred: Boolean(row.is_starred),
	}));

	const nextCursor =
		last !== undefined ? btoa(JSON.stringify({ r: last.rank, id: last.id })) : null;

	return { items, nextCursor };
}

/**
 * Keep the FTS `feed_title` column in sync when a feed is renamed. Without
 * this, search results would keep showing (and matching) the old label.
 */
export async function updateFeedTitleInSearch(
	db: Database,
	feedId: number,
	feedTitle: string,
): Promise<void> {
	await db.run(sql`
      UPDATE entries_fts
      SET feed_title = ${feedTitle}
      WHERE entry_id IN (SELECT id FROM entries WHERE feed_id = ${feedId})
    `);
}
