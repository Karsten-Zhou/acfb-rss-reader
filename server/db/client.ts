import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";

import * as schema from "./schema/index.ts";

export type Schema = typeof schema;

/** The typed D1-backed database handle used across the app. */
export type Database = DrizzleD1Database<Schema>;

// --- Transient D1 error retry -----------------------------------------------
// D1 (especially the remote binding, where a single query can take seconds)
// throws transient "database is locked"-style failures when reads contend
// with writes. Retrying with an exponential backoff that matches the remote
// latency makes the app resilient to these instead of surfacing 500s.

const TRANSIENT_RE =
	/locked|busy|SQLITE_BUSY|timed out|timeout|Failed query|D1_ERROR|internal error/i;
/** Backoff between retries (ms). Long enough to let a slow remote D1 settle. */
const RETRY_DELAYS_MS = [300, 1000, 2500, 5000];
/** Spread retries a little so concurrent requests don't stampede together. */
const JITTER_MS = 150;

function isTransientError(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err);
	return TRANSIENT_RE.test(message);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(run: () => Promise<T>, delays: readonly number[]): Promise<T> {
	let lastErr: unknown;
	for (let attempt = 0; attempt <= delays.length; attempt += 1) {
		try {
			return await run();
		} catch (err) {
			lastErr = err;
			if (!isTransientError(err) || attempt === delays.length) break;
			const delay = (delays[attempt] ?? 0) + Math.random() * JITTER_MS;
			await sleep(delay);
		}
	}
	throw lastErr;
}

const EXECUTION_METHODS = new Set(["all", "run", "first", "raw", "values", "batch"]);

function wrapStatement(stmt: D1PreparedStatement, delays: readonly number[]): D1PreparedStatement {
	return new Proxy(stmt, {
		get(target, prop, receiver) {
			if (prop === "bind") {
				return (...values: unknown[]) => wrapStatement(target.bind(...values), delays);
			}
			if (typeof prop === "string" && EXECUTION_METHODS.has(prop)) {
				return (...args: unknown[]) =>
					withRetry(
						() =>
							(target[prop as keyof D1PreparedStatement] as (...a: unknown[]) => Promise<unknown>)(
								...args,
							),
						delays,
					);
			}
			const value = Reflect.get(target, prop, receiver);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

/** Wrap a D1 binding so transient lock/busy failures are retried with backoff. */
export function withD1Retry(
	binding: D1Database,
	delays: readonly number[] = RETRY_DELAYS_MS,
): D1Database {
	return new Proxy(binding, {
		get(target, prop, receiver) {
			if (prop === "prepare") {
				return (query: string) => wrapStatement(target.prepare(query), delays);
			}
			if (prop === "batch") {
				return (statements: D1PreparedStatement[]) =>
					withRetry(() => target.batch(statements), delays);
			}
			if (prop === "exec") {
				return (query: string) => withRetry(() => target.exec(query), delays);
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
