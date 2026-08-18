import { Hono } from "hono";
import { z } from "zod";
import { pushSubscriptionSchema } from "../../shared/index.ts";
import { HttpError } from "../errors.ts";
import { requireAuth } from "../middleware/auth.ts";
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
 * user's current subscription list.
 */
pushRoutes.get("/capability", requireAuth(), async (c) => {
	const db = c.get("db");
	const user = c.get("user");
	const vapid = getVapidConfig(c.env);

	const subs = await listPushSubscriptions(db, user.id);

	return c.json({
		configured: vapid !== null,
		publicKey: vapid?.publicKey ?? null,
		subscriptions: subs,
	});
});

/**
 * GET /api/push/key — the VAPID public key, required by
 * `pushManager.subscribe()`. Authentication is required so the key is only
 * served to signed-in users, but the key itself is public (it is not a
 * secret). Returns 409 when Web Push is not configured.
 */
pushRoutes.get("/key", requireAuth(), async (c) => {
	const vapid = getVapidConfig(c.env);
	if (!vapid) throw new HttpError(409, "PUSH_NOT_CONFIGURED", "Push is not configured");
	return c.json({ publicKey: vapid.publicKey });
});

/**
 * PUT /api/push/subscription — create or update the current device's
 * subscription. Identity is derived from the authenticated user server-side;
 * the client NEVER supplies a user id.
 */
pushRoutes.put("/subscription", requireAuth(), async (c) => {
	const body = await c.req.json();
	const input = parseOr400(pushSubscriptionSchema, body);
	const user = c.get("user");
	const { id } = await upsertPushSubscription(c.get("db"), user.id, input);
	return c.json({ ok: true, id });
});

/**
 * DELETE /api/push/subscription/:id — remove a subscription, enforcing that
 * it belongs to the authenticated user.
 */
pushRoutes.delete("/subscription/:id", requireAuth(), async (c) => {
	const id = parseOr400(idSchema, c.req.param("id"));
	const user = c.get("user");
	const removed = await removePushSubscription(c.get("db"), user.id, id);
	if (removed === 0) throw new HttpError(404, "NOT_FOUND", "Subscription not found");
	return c.json({ ok: true });
});

/**
 * POST /api/push/subscription/remove — remove by endpoint. Used when the
 * browser's subscription changed or was unsubscribed locally.
 */
pushRoutes.post("/subscription/remove", requireAuth(), async (c) => {
	const { endpoint } = parseOr400(removeByEndpointSchema, await c.req.json());
	const user = c.get("user");
	await removePushSubscriptionByEndpoint(c.get("db"), user.id, endpoint);
	return c.json({ ok: true });
});

/**
 * POST /api/push/cleanup — remove deactivated (dead) subscriptions.
 * Housekeeping endpoint.
 */
pushRoutes.post("/cleanup", requireAuth(), async (c) => {
	const removed = await cleanupInactiveSubscriptions(c.get("db"));
	return c.json({ ok: true, removed });
});
