import { settings } from "@rss/database";
import type { BatchItem } from "drizzle-orm/batch";
import { Hono } from "hono";
import { z } from "zod";

import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../types.ts";

const settingsPatchSchema = z.record(z.string(), z.unknown());

export const settingsRoutes = new Hono<AppEnv>();

/** GET /api/settings — all settings as a flat key/value map. */
settingsRoutes.get("/", requireAuth(), async (c) => {
	const rows = await c.get("db").select().from(settings).all();
	const map: Record<string, unknown> = {};
	for (const row of rows) {
		try {
			map[row.key] = JSON.parse(row.value);
		} catch {
			map[row.key] = row.value;
		}
	}
	return c.json({ settings: map });
});

/** PUT /api/settings — upsert settings (values are JSON-encoded). */
settingsRoutes.put("/", requireAuth(), async (c) => {
	const body = settingsPatchSchema.parse(await c.req.json());
	const db = c.get("db");

	const batch: BatchItem<"sqlite">[] = [];
	for (const [key, value] of Object.entries(body)) {
		const json = JSON.stringify(value);
		batch.push(
			db
				.insert(settings)
				.values({ key, value: json })
				.onConflictDoUpdate({
					target: settings.key,
					set: { value: json, updatedAt: new Date() },
				}),
		);
	}
	if (batch.length > 0) {
		await db.batch(batch as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
	}
	return c.json({ ok: true });
});
