import { and, desc, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { Hono } from "hono";
import { z } from "zod";
import {
	bulkUpdateEntriesSchema,
	type EntryFlags,
	idSchema,
	paginationQuerySchema,
	updateEntrySchema,
} from "../../shared/index.ts";
import { type Database, entries, feeds, readStatus, starred } from "../db/index.ts";

import { HttpError } from "../errors.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../types.ts";

const entriesQuerySchema = z.object({
	feedId: z.coerce.number().int().positive().optional(),
	folderId: z.coerce.number().int().positive().optional(),
	unread: z.enum(["true", "1"]).optional(),
	starred: z.enum(["true", "1"]).optional(),
	archived: z.enum(["true", "1"]).optional(),
	...paginationQuerySchema.shape,
});

interface Cursor {
	p: number;
	id: number;
}

function encodeCursor(publishedAt: Date | null, id: number): string {
	return btoa(JSON.stringify({ p: publishedAt ? publishedAt.getTime() : 0, id } satisfies Cursor));
}

function decodeCursor(cursor: string | undefined): Cursor | null {
	if (!cursor) return null;
	try {
		const parsed = JSON.parse(atob(cursor)) as Cursor;
		if (typeof parsed.p === "number" && typeof parsed.id === "number") return parsed;
	} catch {
		return null;
	}
	return null;
}

/** Mark entries read/archived/starred, computing the new state in JS. */
async function setEntriesFlags(db: Database, entryIds: number[], flags: EntryFlags): Promise<void> {
	const existing = await db
		.select()
		.from(readStatus)
		.where(inArray(readStatus.entryId, entryIds))
		.all();
	const statusById = new Map(existing.map((row) => [row.entryId, row]));

	const items: BatchItem<"sqlite">[] = [];

	for (const entryId of entryIds) {
		const current = statusById.get(entryId);
		const next = {
			entryId,
			isRead: flags.isRead ?? current?.isRead ?? false,
			archived: flags.isArchived ?? current?.archived ?? false,
			readAt: current?.readAt ?? null,
			archivedAt: current?.archivedAt ?? null,
		};
		if (flags.isRead === true) next.readAt = new Date();
		if (flags.isRead === false) next.readAt = null;
		if (flags.isArchived === true) next.archivedAt = new Date();
		if (flags.isArchived === false) next.archivedAt = null;

		items.push(
			db
				.insert(readStatus)
				.values(next)
				.onConflictDoUpdate({
					target: readStatus.entryId,
					set: {
						isRead: next.isRead,
						archived: next.archived,
						readAt: next.readAt,
						archivedAt: next.archivedAt,
					},
				}),
		);
		if (flags.isStarred === true) {
			items.push(db.insert(starred).values({ entryId }).onConflictDoNothing());
		} else if (flags.isStarred === false) {
			items.push(db.delete(starred).where(eq(starred.entryId, entryId)));
		}
	}

	await db.batch(items as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}

export const entryRoutes = new Hono<AppEnv>();

/** GET /api/entries — paginated entry list with filters. */
entryRoutes.get("/", requireAuth(), async (c) => {
	const db = c.get("db");
	const query = entriesQuerySchema.parse(c.req.query());
	const { limit } = query;

	const published = sql<number>`COALESCE(${entries.publishedAt}, 0)`;
	const conditions = [];
	if (query.feedId) conditions.push(eq(entries.feedId, query.feedId));
	if (query.folderId) conditions.push(eq(feeds.folderId, query.folderId));
	if (query.unread) conditions.push(eq(readStatus.isRead, false));
	if (query.archived) conditions.push(eq(readStatus.archived, true));
	if (query.starred) conditions.push(isNotNull(starred.entryId));

	const cursor = decodeCursor(query.cursor);
	if (cursor) {
		conditions.push(
			or(lt(published, cursor.p), and(eq(published, cursor.p), lt(entries.id, cursor.id))),
		);
	}

	const rows = await db
		.select({
			id: entries.id,
			title: entries.title,
			url: entries.url,
			author: entries.author,
			summary: entries.summary,
			imageUrl: entries.imageUrl,
			publishedAt: entries.publishedAt,
			feedId: entries.feedId,
			feedTitle: feeds.title,
			isRead: readStatus.isRead,
			isArchived: readStatus.archived,
			isStarred: sql<boolean>`${starred.entryId} IS NOT NULL`,
		})
		.from(entries)
		.innerJoin(feeds, eq(feeds.id, entries.feedId))
		.leftJoin(readStatus, eq(readStatus.entryId, entries.id))
		.leftJoin(starred, eq(starred.entryId, entries.id))
		.where(and(...conditions))
		.orderBy(desc(published), desc(entries.id))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const pageRows = hasMore ? rows.slice(0, limit) : rows;
	const last = pageRows.at(-1);

	return c.json({
		items: pageRows,
		nextCursor: last ? encodeCursor(last.publishedAt, last.id) : null,
	});
});

/** GET /api/entries/:id — full entry with content and flags. */
entryRoutes.get("/:id", requireAuth(), async (c) => {
	const db = c.get("db");
	const id = idSchema.parse(c.req.param("id"));

	const row = await db.query.entries.findFirst({
		where: eq(entries.id, id),
		with: {
			feed: true,
			content: true,
			readStatus: true,
			starred: true,
			tags: { with: { tag: true } },
		},
	});
	if (!row) throw new HttpError(404, "NOT_FOUND", "Entry not found");

	return c.json({
		entry: {
			id: row.id,
			title: row.title,
			url: row.url,
			author: row.author,
			summary: row.summary,
			imageUrl: row.imageUrl,
			publishedAt: row.publishedAt,
			feed: {
				id: row.feed.id,
				title: row.feed.title,
				faviconUrl: row.feed.faviconUrl,
				siteUrl: row.feed.siteUrl,
			},
			content: row.content?.content ?? null,
			isRead: row.readStatus?.isRead ?? false,
			isArchived: row.readStatus?.archived ?? false,
			isStarred: row.starred !== null,
			tags: row.tags.map((t) => t.tag.name),
		},
	});
});

/** PATCH /api/entries/:id — update read/starred/archived flags. */
entryRoutes.patch("/:id", requireAuth(), async (c) => {
	const db = c.get("db");
	const id = idSchema.parse(c.req.param("id"));
	const flags = updateEntrySchema.parse(await c.req.json());

	const exists = await db.query.entries.findFirst({
		where: eq(entries.id, id),
		columns: { id: true },
	});
	if (!exists) throw new HttpError(404, "NOT_FOUND", "Entry not found");

	await setEntriesFlags(db, [id], flags);
	return c.json({ ok: true });
});

/** POST /api/entries/bulk — update flags on many entries at once. */
entryRoutes.post("/bulk", requireAuth(), async (c) => {
	const db = c.get("db");
	const input = bulkUpdateEntriesSchema.parse(await c.req.json());

	const existing = await db
		.select({ id: entries.id })
		.from(entries)
		.where(inArray(entries.id, input.entryIds))
		.all();
	const found = new Set(existing.map((row) => row.id));
	const validIds = input.entryIds.filter((id) => found.has(id));
	if (validIds.length > 0) {
		await setEntriesFlags(db, validIds, input);
	}

	return c.json({ ok: true, updated: validIds.length });
});
