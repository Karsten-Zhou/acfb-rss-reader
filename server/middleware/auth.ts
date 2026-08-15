import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import {
	addMs,
	isExpired,
	SESSION_COOKIE,
	SESSION_SLIDING_WINDOW_MS,
	SESSION_TTL_MS,
	sha256Hex,
} from "../../shared/index.ts";
import { sessions } from "../db/index.ts";

import { HttpError } from "../errors.ts";
import type { AppEnv } from "../types.ts";

export interface AuthResult {
	user: NonNullable<Awaited<ReturnType<typeof authenticate>>>["user"];
	session: NonNullable<Awaited<ReturnType<typeof authenticate>>>["session"];
}

/**
 * Resolve the current session from the cookie, or null. Performs a sliding
 * expiry renewal so active sessions stay alive.
 */
export async function authenticate(c: Context<AppEnv>) {
	const token = getCookie(c, SESSION_COOKIE);
	if (!token) return null;

	const tokenHash = await sha256Hex(token);
	const db = c.get("db");

	const session = await db.query.sessions.findFirst({
		where: eq(sessions.tokenHash, tokenHash),
		with: { user: true },
	});
	if (!session) return null;

	if (isExpired(session.expiresAt)) {
		await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
		deleteCookie(c, SESSION_COOKIE, { path: "/" });
		return null;
	}

	if (Date.now() - session.lastSeenAt.getTime() >= SESSION_SLIDING_WINDOW_MS) {
		const now = new Date();
		const expiresAt = addMs(now, SESSION_TTL_MS);
		await db
			.update(sessions)
			.set({ lastSeenAt: now, expiresAt })
			.where(eq(sessions.tokenHash, tokenHash));
		session.lastSeenAt = now;
		session.expiresAt = expiresAt;
	}

	return { user: session.user, session };
}

/** Require an authenticated session; 401 otherwise. */
export function requireAuth(): MiddlewareHandler<AppEnv> {
	return async (c, next) => {
		const auth = await authenticate(c);
		if (!auth) {
			throw new HttpError(401, "UNAUTHENTICATED", "Authentication required");
		}
		c.set("user", auth.user);
		c.set("session", auth.session);
		await next();
	};
}
