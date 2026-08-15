import { z } from "zod";

import { OAUTH_STATE_TTL_MS } from "../constants.ts";

/** Payload stored in KV for an in-flight GitHub OAuth flow. */
export const oauthStateSchema = z.object({
	/** Random state parameter that must round-trip with the callback. */
	state: z.string().min(16).max(128),
	/** Where to redirect the browser after a successful login. */
	redirectTo: z.string().url(),
	/** Expiry timestamp (ms) — we validate on read as well. */
	expiresAt: z.number().int().positive(),
});

export type OAuthState = z.infer<typeof oauthStateSchema>;

/** Build a fresh OAuth state payload for the given redirect target. */
export function createOAuthState(state: string, redirectTo: string): OAuthState {
	return {
		state,
		redirectTo,
		expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
	};
}

/** True when the stored OAuth state has not yet expired. */
export function isOAuthStateValid(state: OAuthState): boolean {
	return state.expiresAt > Date.now();
}
