import { z } from "zod";

import { PAGINATION_DEFAULT_LIMIT, PAGINATION_MAX_LIMIT } from "../constants.ts";

/** Positive integer ID used by D1 auto-increment primary keys. */
export const idSchema = z.coerce.number().int().positive();

/** Cursor-based pagination query parameters. */
export const paginationQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
	cursor: z.string().min(1).max(512).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** ISO 8601 date-time string (e.g. "2026-08-16T12:00:00Z"). */
export const isoDateTimeSchema = z.string().datetime({ offset: true });
