import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";

import * as schema from "./schema/index.ts";

export type Schema = typeof schema;

/** The typed D1-backed database handle used across the app. */
export type Database = DrizzleD1Database<Schema>;

// --- Transient D1 error retry -----------------------------------------------
// Local miniflare D1 (and D1 under burst load) can throw transient
// "database is locked"-style failures when reads contend with writes.
// Retrying with a short backoff makes the app resilient to these.

const TRANSIENT_RE = /locked|busy|SQLITE_BUSY|timed out|timeout|Failed query/i;
const RETRY_DELAYS_MS = [50, 150, 400];

function isTransientError(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err);
	return TRANSIENT_RE.test(message);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
	let lastErr: unknown;
	for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
		try {
			return await run();
		} catch (err) {
			lastErr = err;
			if (!isTransientError(err) || attempt === RETRY_DELAYS_MS.length) break;
			await sleep(RETRY_DELAYS_MS[attempt] ?? 0);
		}
	}
	throw lastErr;
}

const EXECUTION_METHODS = new Set(["all", "run", "first", "raw", "values", "batch"]);

function wrapStatement(stmt: D1PreparedStatement): D1PreparedStatement {
	return new Proxy(stmt, {
		get(target, prop, receiver) {
			if (prop === "bind") {
				return (...values: unknown[]) => wrapStatement(target.bind(...values));
			}
			if (typeof prop === "string" && EXECUTION_METHODS.has(prop)) {
				return (...args: unknown[]) =>
					withRetry(() =>
						(target[prop as keyof D1PreparedStatement] as (...a: unknown[]) => Promise<unknown>)(
							...args,
						),
					);
			}
			const value = Reflect.get(target, prop, receiver);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

/** Wrap a D1 binding so transient lock/busy failures are retried with backoff. */
export function withD1Retry(binding: D1Database): D1Database {
	return new Proxy(binding, {
		get(target, prop, receiver) {
			if (prop === "prepare") {
				return (query: string) => wrapStatement(target.prepare(query));
			}
			if (prop === "batch") {
				return (statements: D1PreparedStatement[]) => withRetry(() => target.batch(statements));
			}
			if (prop === "exec") {
				return (query: string) => withRetry(() => target.exec(query));
			}
			const value = Reflect.get(target, prop, receiver);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

/** Create a database handle bound to a D1 binding. */
export function createDb(binding: D1Database): Database {
	return drizzle(withD1Retry(binding), { schema });
}
