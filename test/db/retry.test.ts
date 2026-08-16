import { expect, test } from "bun:test";

import { withD1Retry } from "../../server/db/client.ts";

/** Short delays so the exhaustive-retry tests stay fast. */
const TEST_DELAYS = [1, 1, 1];

/** A minimal D1 binding whose prepared statements fail N times with a transient error. */
function createFlakyBinding(
	failures: number,
	message = "Failed query: database is locked",
): D1Database {
	let remaining = failures;
	const prepare = (_query: string): D1PreparedStatement => {
		const stmt = {
			bind: () => stmt,
			all: async () => {
				if (remaining > 0) {
					remaining -= 1;
					throw new Error(message);
				}
				return { results: [{ ok: 1 }], success: true, meta: {} };
			},
			run: async () => {
				if (remaining > 0) {
					remaining -= 1;
					throw new Error(message);
				}
				return { results: [], success: true, meta: {} };
			},
			first: async () => {
				if (remaining > 0) {
					remaining -= 1;
					throw new Error(message);
				}
				return null;
			},
			raw: async () => [],
			values: async () => [],
		};
		return stmt as unknown as D1PreparedStatement;
	};
	return { prepare, batch: async () => [], exec: async () => [] } as unknown as D1Database;
}

test("withD1Retry retries transient lock failures and succeeds", async () => {
	const binding = createFlakyBinding(2);
	const db = withD1Retry(binding, TEST_DELAYS);

	const result = await db.prepare("SELECT 1").all();
	expect(result.success).toBe(true);
});

test("withD1Retry retries transient failures on run()", async () => {
	const binding = createFlakyBinding(1);
	const db = withD1Retry(binding, TEST_DELAYS);

	const result = await db.prepare("UPDATE x SET y = 1").run();
	expect(result.success).toBe(true);
});

test("withD1Retry propagates persistent failures after exhausting retries", async () => {
	const binding = createFlakyBinding(10);
	const db = withD1Retry(binding, TEST_DELAYS);

	expect(db.prepare("SELECT 1").all()).rejects.toThrow("database is locked");
});

test("withD1Retry does not retry non-transient errors", async () => {
	const binding = createFlakyBinding(10, "syntax error near SELECT");
	const db = withD1Retry(binding);

	// Should reject quickly with the original error (no retry masking).
	const started = Date.now();
	await expect(db.prepare("SELECT FROM").all()).rejects.toThrow("syntax error");
	expect(Date.now() - started).toBeLessThan(100);
});
