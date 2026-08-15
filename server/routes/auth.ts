import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { OAuthState } from "../../shared/index.ts";
import {
	addMs,
	createOAuthState,
	isOAuthStateValid,
	KV_OAUTH_STATE_TTL_SECONDS,
	oauthStateSchema,
	randomHex,
	SESSION_COOKIE,
	SESSION_TTL_MS,
	sha256Hex,
} from "../../shared/index.ts";
import { sessions, users } from "../db/index.ts";

import { HttpError } from "../errors.ts";
import { buildAuthorizeUrl, exchangeCode, fetchGitHubUser } from "../github.ts";
import { logger } from "../logging.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { AppEnv } from "../types.ts";

const OAUTH_STATE_KEY_PREFIX = "oauth:";

function redirectUriFor(origin: string): string {
	return `${origin}/api/auth/callback`;
}

export const authRoutes = new Hono<AppEnv>();

/**
 * GET /api/auth/login?redirect_to=/...
 * Redirect the browser to GitHub. `redirect_to` must resolve to the same
 * origin as the app; anything else is rejected.
 */
authRoutes.get("/login", async (c) => {
	const { APP_ORIGIN, GITHUB_CLIENT_ID, KV_STORE } = c.env;

	const redirectTo = c.req.query("redirect_to") ?? "/";
	const target = new URL(redirectTo, APP_ORIGIN);
	if (target.origin !== APP_ORIGIN) {
		throw new HttpError(400, "INVALID_REDIRECT", "Invalid redirect target");
	}

	const state = randomHex(24);
	await KV_STORE.put(
		`${OAUTH_STATE_KEY_PREFIX}${state}`,
		JSON.stringify(createOAuthState(state, target.toString())),
		{ expirationTtl: KV_OAUTH_STATE_TTL_SECONDS },
	);

	return c.redirect(
		buildAuthorizeUrl({
			clientId: GITHUB_CLIENT_ID,
			redirectUri: redirectUriFor(APP_ORIGIN),
			state,
		}),
	);
});

/** GET /api/auth/callback?code=...&state=... */
authRoutes.get("/callback", async (c) => {
	const env = c.env;
	const db = c.get("db");

	const code = c.req.query("code");
	const state = c.req.query("state");
	if (!code || !state) {
		throw new HttpError(400, "INVALID_OAUTH_CALLBACK", "Missing code or state");
	}

	// Validate the state (single-use).
	const raw = await env.KV_STORE.get(`${OAUTH_STATE_KEY_PREFIX}${state}`);
	await env.KV_STORE.delete(`${OAUTH_STATE_KEY_PREFIX}${state}`);
	if (!raw) {
		throw new HttpError(400, "INVALID_STATE", "OAuth state not found or already used");
	}
	let stored: OAuthState;
	try {
		stored = oauthStateSchema.parse(JSON.parse(raw));
	} catch {
		throw new HttpError(400, "INVALID_STATE", "OAuth state is malformed");
	}
	if (stored.state !== state || !isOAuthStateValid(stored)) {
		throw new HttpError(400, "INVALID_STATE", "OAuth state is invalid or expired");
	}

	// Exchange the code and fetch the GitHub profile.
	const accessToken = await exchangeCode({
		clientId: env.GITHUB_CLIENT_ID,
		clientSecret: env.GITHUB_CLIENT_SECRET,
		code,
		redirectUri: redirectUriFor(env.APP_ORIGIN),
	});
	const ghUser = await fetchGitHubUser(accessToken);

	// Single-user gate: reject every GitHub account but the configured one.
	if (String(ghUser.id) !== env.ALLOWED_GITHUB_USER_ID) {
		logger.warn("Login rejected: github account not allowed", {
			githubId: ghUser.id,
			login: ghUser.login,
		});
		throw new HttpError(403, "FORBIDDEN", "This GitHub account is not authorized");
	}

	// Upsert the user.
	let user = await db.query.users.findFirst({ where: eq(users.githubId, ghUser.id) });
	if (!user) {
		const created = await db
			.insert(users)
			.values({
				githubId: ghUser.id,
				githubLogin: ghUser.login,
				name: ghUser.name,
				avatarUrl: ghUser.avatar_url,
			})
			.returning()
			.get();
		if (!created) {
			throw new HttpError(500, "USER_CREATE_FAILED", "Failed to create user");
		}
		user = created;
	} else if (user.githubLogin !== ghUser.login || user.avatarUrl !== ghUser.avatar_url) {
		await db
			.update(users)
			.set({
				githubLogin: ghUser.login,
				name: ghUser.name ?? user.name,
				avatarUrl: ghUser.avatar_url,
			})
			.where(eq(users.id, user.id));
	}

	// Create the session.
	const token = randomHex(32);
	const tokenHash = await sha256Hex(token);
	const expiresAt = addMs(new Date(), SESSION_TTL_MS);
	await db.insert(sessions).values({ tokenHash, userId: user.id, expiresAt });

	setCookie(c, SESSION_COOKIE, token, {
		httpOnly: true,
		secure: env.ENVIRONMENT === "production",
		sameSite: "Lax",
		path: "/",
		maxAge: SESSION_TTL_MS / 1000,
	});

	logger.info("User logged in", { userId: user.id, login: user.githubLogin });
	return c.redirect(stored.redirectTo);
});

/** GET /api/auth/me — current user (requires auth). */
authRoutes.get("/me", requireAuth(), (c) => c.json({ user: c.get("user") }));

/** POST /api/auth/logout — destroy the session. */
authRoutes.post("/logout", async (c) => {
	const token = getCookie(c, SESSION_COOKIE);
	if (token) {
		const tokenHash = await sha256Hex(token);
		await c.get("db").delete(sessions).where(eq(sessions.tokenHash, tokenHash));
	}
	deleteCookie(c, SESSION_COOKIE, { path: "/" });
	return c.json({ ok: true });
});
