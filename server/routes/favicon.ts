import { Hono } from "hono";
import { isLocalhost, KV_FAVICON_TTL_SECONDS } from "../../shared/index.ts";

import type { AppEnv } from "../types.ts";

const FAVICON_KEY_PREFIX = "favicon:";
const FAVICON_TYPE_KEY_PREFIX = "favicon-type:";
const MAX_FAVICON_BYTES = 1024 * 1024; // 1 MiB
const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "rss-reader/1.0 (+personal feed reader)";

function isImageContentType(contentType: string | null): boolean {
	return contentType?.toLowerCase().startsWith("image/") ?? false;
}

/**
 * GET /api/favicon?url=… — proxy + cache a site favicon through the Worker.
 *
 * Browsers often can't hotlink `/favicon.ico` directly (mixed content,
 * hotlink protection, hanging requests), so we fetch server-side and cache
 * the bytes in KV. The URL is validated to avoid SSRF against private hosts.
 */
export const faviconRoutes = new Hono<AppEnv>();

faviconRoutes.get("/", async (c) => {
	const raw = c.req.query("url");
	if (!raw) {
		return c.json({ error: { code: "INVALID_URL", message: "Invalid favicon URL" } }, 400);
	}
	let url: string;
	try {
		const parsed = new URL(raw);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return c.json({ error: { code: "INVALID_URL", message: "Invalid favicon URL" } }, 400);
		}
		url = parsed.toString();
	} catch {
		return c.json({ error: { code: "INVALID_URL", message: "Invalid favicon URL" } }, 400);
	}
	if (isLocalhost(url)) {
		return c.json({ error: { code: "INVALID_URL", message: "Invalid favicon URL" } }, 400);
	}

	const { KV_STORE } = c.env;
	const cacheKey = `${FAVICON_KEY_PREFIX}${url}`;

	// Cache hit?
	const cached = await KV_STORE.get(cacheKey, "arrayBuffer");
	if (cached) {
		const cachedType = await KV_STORE.get(`${FAVICON_TYPE_KEY_PREFIX}${url}`);
		return new Response(cached, {
			headers: {
				"Content-Type": cachedType ?? "image/x-icon",
				"Cache-Control": "public, max-age=86400",
			},
		});
	}

	// Fetch through the Worker (bypasses browser CORS/hotlink issues).
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			headers: { "User-Agent": USER_AGENT },
			signal: controller.signal,
			redirect: "follow",
		});
		if (!res.ok || !isImageContentType(res.headers.get("content-type"))) {
			return c.json(
				{ error: { code: "FAVICON_FETCH_FAILED", message: "Could not fetch favicon" } },
				502,
			);
		}
		const buf = await res.arrayBuffer();
		if (buf.byteLength > MAX_FAVICON_BYTES) {
			return c.json({ error: { code: "FAVICON_TOO_LARGE", message: "Favicon too large" } }, 502);
		}
		const contentType = res.headers.get("content-type") ?? "image/x-icon";
		await Promise.all([
			KV_STORE.put(cacheKey, buf, { expirationTtl: KV_FAVICON_TTL_SECONDS }),
			KV_STORE.put(`${FAVICON_TYPE_KEY_PREFIX}${url}`, contentType, {
				expirationTtl: KV_FAVICON_TTL_SECONDS,
			}),
		]);
		return new Response(buf, {
			headers: {
				"Content-Type": contentType,
				"Cache-Control": "public, max-age=86400",
			},
		});
	} catch {
		return c.json(
			{ error: { code: "FAVICON_FETCH_FAILED", message: "Could not fetch favicon" } },
			502,
		);
	} finally {
		clearTimeout(timer);
	}
});
