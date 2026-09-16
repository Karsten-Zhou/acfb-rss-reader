import { Hono } from "hono";
import { z } from "zod";
import { pushSubscriptionSchema } from "../../shared/index.ts";
import { HttpError } from "../errors.ts";
import { cleanupInactiveSubscriptions } from "../notifications/index.ts";
import {
	listPushSubscriptions,
	removePushSubscription,
	removePushSubscriptionByEndpoint,
	upsertPushSubscription,
} from "../notifications/subscriptions.ts";
import { getVapidConfig } from "../notifications/vapid.ts";
import type { AppEnv } from "../types.ts";

export const pushRoutes = new Hono<AppEnv>();

const idSchema = z.coerce.number().int().positive();
const removeByEndpointSchema = z.object({
	endpoint: z.string().url().max(2048),
});

/**
 * Parse a JSON body against a Zod schema, translating validation failures
 * into a 400 `HttpError` (validation errors shouldn't be 500s).
 */
function parseOr400<T>(schema: z.ZodType<T>, body: unknown): T {
	const result = schema.safeParse(body);
	if (!result.success) {
		throw new HttpError(400, "INVALID_INPUT", "Invalid request body", result.error.issues);
	}
	return result.data;
}

/**
 * GET /api/push/capability — the browser-side capability/status surface:
 * whether Web Push is configured server-side, the VAPID public key, and the
 * currently registered subscriptions.
 */
pushRoutes.get("/capability", async (c) => {
	const db = c.get("db");
	const vapid = getVapidConfig(c.env);

	const subs = await listPushSubscriptions(db);

	return c.json({
		configured: vapid !== null,
		publicKey: vapid?.publicKey ?? null,
		subscriptions: subs,
	});
});

/**
 * GET /api/push/key — the VAPID public key, required by
 * `pushManager.subscribe()`. The key itself is public (it is not a secret).
 * Returns 409 when Web Push is not configured.
 */
pushRoutes.get("/key", async (c) => {
	const vapid = getVapidConfig(c.env);
	if (!vapid) throw new HttpError(409, "PUSH_NOT_CONFIGURED", "Push is not configured");
	return c.json({ publicKey: vapid.publicKey });
});

/**
 * PUT /api/push/subscription — create or update the current device's
 * subscription. The endpoint uniquely identifies the browser subscription.
 */
pushRoutes.put("/subscription", async (c) => {
	const body = await c.req.json();
	const input = parseOr400(pushSubscriptionSchema, body);
	const { id } = await upsertPushSubscription(c.get("db"), input);
	return c.json({ ok: true, id });
});

/** DELETE /api/push/subscription/:id — remove a subscription by id. */
pushRoutes.delete("/subscription/:id", async (c) => {
	const id = parseOr400(idSchema, c.req.param("id"));
	const removed = await removePushSubscription(c.get("db"), id);
	if (removed === 0) throw new HttpError(404, "NOT_FOUND", "Subscription not found");
	return c.json({ ok: true });
});

/**
 * POST /api/push/subscription/remove — remove by endpoint. Used when the
 * browser's subscription changed or was unsubscribed locally.
 */
pushRoutes.post("/subscription/remove", async (c) => {
	const { endpoint } = parseOr400(removeByEndpointSchema, await c.req.json());
	await removePushSubscriptionByEndpoint(c.get("db"), endpoint);
	return c.json({ ok: true });
});

/**
 * POST /api/push/cleanup — remove deactivated (dead) subscriptions.
 * Housekeeping endpoint.
 */
pushRoutes.post("/cleanup", async (c) => {
	const removed = await cleanupInactiveSubscriptions(c.get("db"));
	return c.json({ ok: true, removed });
});
