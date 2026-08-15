import type { Database as BunSqlite } from "bun:sqlite";

/**
 * A minimal D1Database implementation backed by `bun:sqlite`.
 *
 * This lets us test Hono routes and the Drizzle D1 driver without spinning up
 * the workerd runtime. It implements the subset of the D1 API that
 * `drizzle-orm/d1` uses: prepare/bind/all/run/first/raw, batch and exec.
 */

function d1Result<T>(results: T[], meta: Record<string, unknown> = {}): D1Result<T> {
	return { results, success: true, meta } as D1Result<T>;
}

export function createD1Mock(db: BunSqlite): D1Database {
	return {
		prepare(query: string): D1PreparedStatement {
			const stmt = db.prepare(query);
			const state = { params: [] as unknown[] };
			const self: D1PreparedStatement = {
				bind(...values: unknown[]): D1PreparedStatement {
					state.params = values;
					return self;
				},
				async all<T = unknown>(): Promise<D1Result<T>> {
					const rows = stmt.all(...state.params) as T[];
					return d1Result(rows, { rows_read: rows.length });
				},
				async run<T = unknown>(): Promise<D1Result<T>> {
					const info = stmt.run(...state.params);
					return d1Result([] as unknown as T[], {
						changes: info.changes,
						last_row_id: Number(info.lastInsertRowid),
						rows_written: info.changes,
					});
				},
				async first<T = unknown>(colName?: string): Promise<T> {
					const row = stmt.get(...state.params) as Record<string, unknown> | null;
					if (colName !== undefined) {
						return (row ? (row[colName] ?? null) : null) as T;
					}
					return (row ?? null) as T;
				},
				async raw<T = unknown>(): Promise<T[]> {
					// Note: bun:sqlite's Statement.raw() skips type conversion and
					// returns raw byte buffers. Drizzle's D1 driver uses raw() for
					// mapped queries, so decode via all() + Object.values instead.
					const rows = stmt.all(...state.params) as Record<string, unknown>[];
					return rows.map((row) => Object.values(row)) as T[];
				},
			};
			return self;
		},
		async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
			const results: D1Result<T>[] = [];
			for (const s of statements) {
				results.push(await (s as D1PreparedStatement & { all(): Promise<D1Result<T>> }).all());
			}
			return results;
		},
		async exec(query: string): Promise<D1Result> {
			db.exec(query);
			return d1Result([]);
		},
		async dump(): Promise<ArrayBuffer> {
			return new ArrayBuffer(0);
		},
	} as D1Database;
}
