/**
 * Pure URL helpers used by feed ingestion and rendering.
 */

/** Extract the hostname from a URL, or null when the URL is invalid. */
export function getHostname(url: string): string | null {
	try {
		return new URL(url).hostname;
	} catch {
		return null;
	}
}

/** Best-effort favicon URL for a feed, based on its own or its site URL. */
export function guessFaviconUrl(feedUrl: string, siteUrl?: string | null): string | null {
	const base = siteUrl || feedUrl;
	try {
		const u = new URL(base);
		return `${u.protocol}//${u.hostname}/favicon.ico`;
	} catch {
		return null;
	}
}

/** Normalize a feed URL for storage/duplicate checks. */
export function normalizeUrl(raw: string): string | null {
	const trimmed = raw.trim();
	if (trimmed.length === 0) return null;
	const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	try {
		const u = new URL(withScheme);
		if (u.protocol !== "http:" && u.protocol !== "https:") return null;
		u.hash = "";
		return u.toString();
	} catch {
		return null;
	}
}

/** True when the URL points at a localhost / loopback address. */
export function isLocalhost(url: string): boolean {
	try {
		const hostname = new URL(url).hostname;
		return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
	} catch {
		return false;
	}
}
