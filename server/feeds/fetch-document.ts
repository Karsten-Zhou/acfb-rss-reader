import {
	FETCH_MAX_REDIRECTS,
	FETCH_TIMEOUT_MS,
	KV_FEED_BODY_TTL_SECONDS,
	MAX_FEED_DOCUMENT_BYTES,
} from "../../shared/index.ts";

import { FeedError } from "./errors.ts";

const USER_AGENT =
	"Mozilla/5.0 (compatible; rss-reader/1.0; +https://github.com/XiaoSong-CPE/cloudflare-based-rss-reader)";

const ACCEPT =
	"application/atom+xml, application/rss+xml, application/xml, text/xml, application/json, */*;q=0.8";

export interface FetchDocumentOptions {
	url: string;
	etag?: string | null;
	lastModified?: string | null;
	timeoutMs?: number;
	maxRedirects?: number;
	maxRetries?: number;
	/** KV store + cache key for the stale-body fallback. */
	kv?: KVNamespace;
	cacheKey?: string;
}

export type FetchDocumentResult =
	| {
			kind: "ok";
			body: string;
			etag: string | null;
			lastModified: string | null;
			finalUrl: string;
			httpStatus: number | null;
			fromCache: boolean;
	  }
	| { kind: "not_modified"; etag: string | null; lastModified: string | null }
	| { kind: "error"; httpStatus: number | null; error: string; retryable: boolean };

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number): number {
	// 1s, 3s, 7s...
	return 1000 * (2 ** (attempt - 1) + attempt - 1);
}

/** True for statuses worth retrying with backoff. */
function isRetryableStatus(status: number): boolean {
	return status === 429 || status >= 500 || status === 408;
}

async function requestOnce(
	url: string,
	headers: Record<string, string>,
	timeoutMs: number,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, { headers, redirect: "manual", signal: controller.signal });
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			throw new FeedError("Fetch timed out", "TIMEOUT", true);
		}
		throw new FeedError(
			`Network error: ${err instanceof Error ? err.message : String(err)}`,
			"NETWORK",
			true,
		);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Download a feed document with:
 * - conditional requests (If-None-Match / If-Modified-Since)
 * - manual redirect handling (records the final URL)
 * - a hard timeout
 * - retries with exponential backoff for transient failures
 * - a stale KV body fallback when a retryable failure occurs
 */
export async function fetchFeedDocument(
	options: FetchDocumentOptions,
): Promise<FetchDocumentResult> {
	const {
		url,
		timeoutMs = FETCH_TIMEOUT_MS,
		maxRedirects = FETCH_MAX_REDIRECTS,
		maxRetries = 2,
		kv,
		cacheKey,
	} = options;

	const headers: Record<string, string> = {
		"User-Agent": USER_AGENT,
		Accept: ACCEPT,
	};
	if (options.etag) headers["If-None-Match"] = options.etag;
	if (options.lastModified) headers["If-Modified-Since"] = options.lastModified;

	let currentUrl = url;
	let redirects = 0;
	let retries = 0;

	for (;;) {
		try {
			const res = await requestOnce(currentUrl, headers, timeoutMs);

			// Redirects
			const location = res.headers.get("location");
			if (res.status >= 300 && res.status < 400 && location) {
				if (redirects >= maxRedirects) {
					return {
						kind: "error",
						httpStatus: res.status,
						error: "Too many redirects",
						retryable: false,
					};
				}
				currentUrl = new URL(location, currentUrl).toString();
				redirects++;
				continue;
			}

			// Conditional request: nothing changed
			if (res.status === 304) {
				return {
					kind: "not_modified",
					etag: options.etag ?? null,
					lastModified: options.lastModified ?? null,
				};
			}

			// Hard failures that should not be retried
			if (res.status === 404 || res.status === 410 || res.status === 403) {
				return {
					kind: "error",
					httpStatus: res.status,
					error: `Feed unreachable (HTTP ${res.status})`,
					retryable: false,
				};
			}

			// Transient failures: retry with backoff
			if (isRetryableStatus(res.status)) {
				if (retries < maxRetries) {
					retries++;
					await sleep(backoffDelay(retries));
					continue;
				}
				return await staleFallback(kv, cacheKey, res.status);
			}

			if (!res.ok) {
				return {
					kind: "error",
					httpStatus: res.status,
					error: `Unexpected HTTP ${res.status}`,
					retryable: isRetryableStatus(res.status),
				};
			}

			// 200 OK: enforce a size cap, then cache the body for stale fallback.
			const contentLength = Number(res.headers.get("content-length") ?? "0");
			if (contentLength > MAX_FEED_DOCUMENT_BYTES) {
				return {
					kind: "error",
					httpStatus: res.status,
					error: "Feed document too large",
					retryable: false,
				};
			}
			const body = await res.text();
			if (body.length > MAX_FEED_DOCUMENT_BYTES) {
				return {
					kind: "error",
					httpStatus: res.status,
					error: "Feed document too large",
					retryable: false,
				};
			}

			const etag = res.headers.get("etag");
			const lastModified = res.headers.get("last-modified");
			if (kv && cacheKey) {
				await kv.put(cacheKey, body, { expirationTtl: KV_FEED_BODY_TTL_SECONDS });
			}
			return {
				kind: "ok",
				body,
				etag,
				lastModified,
				finalUrl: currentUrl,
				httpStatus: res.status,
				fromCache: false,
			};
		} catch (err) {
			const feedError =
				err instanceof FeedError ? err : new FeedError(String(err), "UNKNOWN", true);
			if (feedError.retryable && retries < maxRetries) {
				retries++;
				await sleep(backoffDelay(retries));
				continue;
			}
			return await staleFallback(kv, cacheKey, null, feedError.message);
		}
	}
}

async function staleFallback(
	kv: KVNamespace | undefined,
	cacheKey: string | undefined,
	httpStatus: number | null,
	error?: string,
): Promise<FetchDocumentResult> {
	if (kv && cacheKey) {
		const cached = await kv.get(cacheKey);
		if (cached) {
			return {
				kind: "ok",
				body: cached,
				etag: null,
				lastModified: null,
				finalUrl: "",
				httpStatus,
				fromCache: true,
			};
		}
	}
	return {
		kind: "error",
		httpStatus,
		error: error ?? "Feed fetch failed",
		retryable: false,
	};
}
