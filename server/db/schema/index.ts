/**
 * Drizzle schema — the single source of truth for the database.
 *
 * Note: the FTS5 search index (`entries_fts`) is intentionally NOT declared
 * here. It is created with raw SQL in the initial migration and maintained via
 * the database package's search helpers so that `drizzle-kit generate` never
 * tries to recreate it as a normal table.
 */

export * from "./entries.ts";
export * from "./feeds.ts";
export * from "./notifications.ts";
export * from "./relations.ts";
export * from "./search.ts";
export * from "./system.ts";
