import webpush from "web-push";
import type { Env } from "../types.ts";

export interface VapidConfig {
	publicKey: string;
	privateKey: string;
	subject: string;
}

/**
 * Read the VAPID configuration from Worker bindings.
 *
 * The private key is only ever read here (server-side) and is never exposed
 * to the frontend. `web-push` signs JWT headers with it for each request.
 */
export function getVapidConfig(env: Env): VapidConfig | null {
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
	return {
		publicKey: env.VAPID_PUBLIC_KEY,
		privateKey: env.VAPID_PRIVATE_KEY,
		subject: env.VAPID_SUBJECT || "mailto:acfb-rss-reader@localhost",
	};
}

/** Configure the global web-push VAPID details, if valid keys are present. */
export function configureWebPush(env: Env): boolean {
	const vapid = getVapidConfig(env);
	if (!vapid) return false;
	webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
	return true;
}
