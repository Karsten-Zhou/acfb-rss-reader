import type { WorkflowEvent } from "cloudflare:workers";
import { WorkflowEntrypoint, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "@rss/api";
import { createDb } from "@rss/database";
import { type RefreshFeedResult, refreshFeeds } from "@rss/feeds";
import type { RefreshWorkflowParams } from "@rss/shared";

const CHUNK_SIZE = 10;

/**
 * Durable feed refresh workflow.
 *
 * Each chunk of feeds runs in a `step.do` with automatic retries and a
 * timeout, so transient failures are retried by the platform and the whole
 * workflow survives restarts. `refreshFeeds` itself is idempotent (guids,
 * conditional requests).
 */
export class RefreshWorkflow extends WorkflowEntrypoint<Env, RefreshWorkflowParams> {
	override async run(event: WorkflowEvent<RefreshWorkflowParams>, step: WorkflowStep) {
		const db = createDb(this.env.DB);
		const feedIds = event.payload.feedIds;

		if (feedIds.length === 0) {
			return { refreshed: 0 };
		}

		let refreshed = 0;
		for (let i = 0; i < feedIds.length; i += CHUNK_SIZE) {
			const chunk = feedIds.slice(i, i + CHUNK_SIZE);
			const results = await step.do<RefreshFeedResult[]>(
				`refresh-feeds-${i + 1}-${i + chunk.length}`,
				{
					retries: { limit: 2, delay: "1 second", backoff: "exponential" },
					timeout: "60 seconds",
				},
				async () => refreshFeeds(db, this.env.KV_STORE, chunk),
			);
			refreshed += results.reduce((sum, r) => sum + (r.outcome === "ok" ? r.newEntries : 0), 0);
		}

		return { refreshed, feeds: feedIds.length };
	}
}
