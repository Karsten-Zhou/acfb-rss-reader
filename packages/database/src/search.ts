import { sql } from "drizzle-orm";

import type { Database } from "./client.ts";

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
          f.rank < ${cursorRank} OR
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

/** Upsert one entry into the FTS index. */
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
	await db.run(sql`
    INSERT INTO entries_fts (entry_id, title, content, author, feed_title, tags)
    VALUES (${entryId}, ${title}, ${content}, ${author ?? ""}, ${feedTitle}, ${tags.join(" ")})
    ON CONFLICT(entry_id) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      author = excluded.author,
      feed_title = excluded.feed_title,
      tags = excluded.tags
  `);
}

/** Remove an entry from the FTS index. */
export async function unindexEntry(db: Database, entryId: number): Promise<void> {
	await db.run(sql`DELETE FROM entries_fts WHERE entry_id = ${entryId}`);
}
