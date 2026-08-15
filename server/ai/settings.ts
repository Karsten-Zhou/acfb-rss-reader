import { type Database, settings } from "../db/index.ts";
import { DEFAULT_SUMMARY_MODEL } from "./models.ts";

/** Settings-table keys for AI summary preferences. */
export const AI_ENABLED_KEY = "aiEnabled";
export const AI_MODEL_KEY = "aiModel";

export interface AiSettings {
	/** Whether AI summaries are enabled (stored per-user in the settings table). */
	enabled: boolean;
	/** Key of the selected model from the summary model registry. */
	modelKey: string;
}

/** Read the user's AI summary preferences (defaults: disabled, default model). */
export async function getAiSettings(db: Database): Promise<AiSettings> {
	const rows = await db.select().from(settings).all();
	const map: Record<string, unknown> = {};
	for (const row of rows) {
		try {
			map[row.key] = JSON.parse(row.value);
		} catch {
			map[row.key] = row.value;
		}
	}
	return {
		enabled: map[AI_ENABLED_KEY] === true,
		modelKey: typeof map[AI_MODEL_KEY] === "string" ? map[AI_MODEL_KEY] : DEFAULT_SUMMARY_MODEL,
	};
}
