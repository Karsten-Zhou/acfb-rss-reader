/**
 * Application-wide constants shared across packages.
 */

/** Default and maximum page size for list endpoints. */
export const PAGINATION_DEFAULT_LIMIT = 50;
export const PAGINATION_MAX_LIMIT = 100;

/** Default fetch timeout for feed downloads. */
export const FETCH_TIMEOUT_MS = 15_000;

/** Maximum number of redirects followed when fetching a feed. */
export const FETCH_MAX_REDIRECTS = 5;

/** Minimum interval enforced between two fetches of the same feed. */
export const FEED_MIN_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/** Default refresh interval used when scheduling feed refreshes. */
export const DEFAULT_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

/** Maximum accepted size (bytes) for a feed document. */
export const MAX_FEED_DOCUMENT_BYTES = 5 * 1024 * 1024;

/** Maximum accepted size (bytes) for an OPML import. */
export const MAX_OPML_BYTES = 2 * 1024 * 1024;

/** Number of entries kept in a single fetch before we stop ingesting. */
export const MAX_ENTRIES_PER_FETCH = 500;

/** How long generated AI summaries are kept in the KV cache (30 days). */
export const KV_SUMMARY_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Public repository URL shown in the About screen. */
export const APP_REPOSITORY_URL = "https://github.com/XiaoSong-CPE/cloudflare-based-rss-reader";

/** How many recent fetch logs we retain per feed before pruning. */
export const FETCH_LOG_RETENTION = 50;

/** KV cache TTLs (seconds). */
export const KV_FAVICON_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const KV_FEED_BODY_TTL_SECONDS = 60 * 60 * 6; // 6 hours

/** Name of the service worker file (root-scoped, served as a static asset). */
export const SERVICE_WORKER_PATH = "/sw.js";
