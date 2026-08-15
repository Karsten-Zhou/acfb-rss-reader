import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";

import * as schema from "./schema/index.ts";

export type Schema = typeof schema;

/** The typed D1-backed database handle used across the app. */
export type Database = DrizzleD1Database<Schema>;

/** Create a database handle bound to a D1 binding. */
export function createDb(binding: D1Database): Database {
	return drizzle(binding, { schema });
}
