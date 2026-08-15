import {
	extractFromJson,
	extractFromXml,
	type FeedData,
	type FeedEntry,
} from "@extractus/feed-extractor";
import striptags from "striptags";
import type { FeedType } from "../../shared/index.ts";
import { MAX_ENTRIES_PER_FETCH } from "../../shared/index.ts";

import type { ParsedEntry, ParsedFeed } from "./types.ts";

/**
 * Parsing is delegated to `@extractus/feed-extractor` (RSS, Atom, RDF and
 * JSON Feed). Because the extractor's normalization strips raw HTML content
 * and authors, we capture those via `getExtraEntryFields`.
 */

const SUMMARY_MAX_LEN = 300;

const ENTITY_MAP: Record<string, string> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#39;": "'",
	"&#x27;": "'",
	"&apos;": "'",
	"&nbsp;": "\u00a0",
};

/** Minimal HTML entity unescaping (sufficient for XML-escaped Atom content). */
function unescapeEntities(input: string): string {
	return input.replace(
		/&(amp|lt|gt|quot|#39|#x27|apos|nbsp);/g,
		(match) => ENTITY_MAP[match] ?? match,
	);
}

function toText(value: unknown): string | null {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return toText(value[0]);
	if (value && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		const inner = obj._text ?? obj["#text"] ?? obj._cdata ?? obj.$t ?? obj._ ?? obj.content;
		return typeof inner === "string" ? unescapeEntities(inner) : null;
	}
	return null;
}

/** Extract an author name from a string, array, or object shape. */
function authorNameFromValue(value: unknown): string | null {
	if (typeof value === "string") return value.trim() || null;
	if (Array.isArray(value)) {
		for (const item of value) {
			const name = authorNameFromValue(item);
			if (name) return name;
		}
		return null;
	}
	if (value && typeof value === "object") {
		const obj = value as Record<string, unknown>;
		const name =
			toText(obj.name) ??
			toText(obj.username) ??
			toText(obj._) ??
			toText(obj.$t) ??
			toText(obj.content);
		return name?.trim() || null;
	}
	return null;
}

function extractAuthor(item: Record<string, unknown>): string | null {
	return authorNameFromValue(item.author ?? item.authors);
}

function extractContentHtml(item: Record<string, unknown>): string | null {
	const candidates = [
		item.content_html, // JSON Feed
		item["content:encoded"], // RSS content:encoded
		typeof item.content === "string" ? item.content : undefined, // Atom/RSS plain content
		typeof item.description === "string" ? item.description : undefined, // fallback
	];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
	}
	// Atom <content> with nested markup
	if (item.content && typeof item.content === "object") {
		const content = item.content as Record<string, unknown>;
		const inner = toText(content);
		if (inner?.trim()) return inner;
	}
	return null;
}

function extractImageUrl(item: Record<string, unknown>): string | null {
	const image = item.image;
	if (typeof image === "string" && image) return image;
	if (image && typeof image === "object") {
		const img = image as Record<string, unknown>;
		const url =
			toText(img.url) ?? toText(img.href) ?? toText(img["@_url"]) ?? toText(img["@_href"]);
		if (url) return url;
	}
	const enclosure = item.enclosure;
	if (typeof enclosure === "string" && enclosure) return enclosure;
	if (enclosure && typeof enclosure === "object") {
		const enc = enclosure as Record<string, unknown>;
		const url =
			toText(enc.url) ?? toText(enc.href) ?? toText(enc["@_url"]) ?? toText(enc["@_href"]);
		if (url) return url;
	}
	const thumb = item["media:thumbnail"] ?? item["media:content"];
	if (typeof thumb === "string" && thumb) return thumb;
	if (thumb && typeof thumb === "object") {
		const t = thumb as Record<string, unknown>;
		const url = toText(t.url) ?? toText(t["@_url"]);
		if (url) return url;
	}
	return null;
}

function extractExtraEntryFields(item: Record<string, unknown>): Record<string, unknown> {
	const extra: Record<string, unknown> = {};
	const content = extractContentHtml(item);
	if (content) extra.content = content;
	const author = extractAuthor(item);
	if (author) extra.author = author;
	const imageUrl = extractImageUrl(item);
	if (imageUrl) extra.imageUrl = imageUrl;
	const updated = toText(item.updated);
	if (updated) extra.updatedAt = updated;
	return extra;
}

function truncate(text: string, max: number): string {
	const trimmed = text.replace(/\s+/g, " ").trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max).trimEnd()}…`;
}

function mapEntry(raw: FeedEntry): ParsedEntry {
	const extra = raw as FeedEntry & Record<string, unknown>;
	const title = (extra.title ?? "").trim() || "(untitled)";
	const url = extra.link || null;
	const content = typeof extra.content === "string" ? extra.content : null;

	// The extractor's description is already plain text (HTML stripped).
	let summary =
		typeof extra.description === "string" && extra.description.trim()
			? extra.description.trim()
			: null;
	if (!summary && content) {
		summary = truncate(striptags(content), SUMMARY_MAX_LEN);
	} else if (summary) {
		summary = truncate(summary, SUMMARY_MAX_LEN);
	}

	const publishedAt = extra.published ? new Date(extra.published) : null;
	const updatedAt = typeof extra.updatedAt === "string" ? new Date(extra.updatedAt) : null;

	return {
		guid: String(extra.id ?? ""),
		title,
		url,
		author: typeof extra.author === "string" ? extra.author : null,
		summary,
		content,
		imageUrl: typeof extra.imageUrl === "string" ? extra.imageUrl : null,
		publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
		updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null,
	};
}

/** Detect the feed format from the raw document. */
function detectFormat(body: string): "json" | "xml" {
	const trimmed = body.trimStart();
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
	return "xml";
}

/** Detect the XML flavor (rss vs atom) from the raw document. */
function detectXmlType(body: string): FeedType {
	if (/<feed\b/i.test(body) && !/<rss\b/i.test(body)) return "atom";
	if (/<rss\b/i.test(body)) return "rss";
	// Default to RSS for RDF and unknown XML feeds.
	return "rss";
}

function stripTrailingSlash(url: string | null | undefined): string | null {
	if (!url) return null;
	return url.replace(/\/+$/, "");
}

/**
 * Parse a raw feed document (XML or JSON) into a normalized ParsedFeed.
 * Throws when the document is malformed or unrecognized.
 */
export function parseFeedDocument(body: string, sourceUrl: string): ParsedFeed {
	const format = detectFormat(body);
	const options = {
		normalization: true,
		descriptionMaxLen: 0, // keep full text; we truncate ourselves
		useISODateFormat: true,
		baseUrl: sourceUrl,
		getExtraEntryFields: extractExtraEntryFields,
	};

	let data: FeedData;
	try {
		data = format === "json" ? extractFromJson(body, options) : extractFromXml(body, options);
	} catch (err) {
		throw new Error(`Could not parse feed: ${err instanceof Error ? err.message : String(err)}`);
	}

	if (!data) {
		throw new Error("Could not parse feed: unrecognized format");
	}

	const feedType: FeedType = format === "json" ? "json" : detectXmlType(body);
	const entries = (data.entries ?? []).slice(0, MAX_ENTRIES_PER_FETCH).map(mapEntry);

	return {
		title: (data.title ?? "").trim() || new URL(sourceUrl).hostname,
		description: data.description?.trim() || null,
		siteUrl: stripTrailingSlash(data.link),
		feedType,
		entries,
	};
}
