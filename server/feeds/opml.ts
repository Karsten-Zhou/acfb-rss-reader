import { XMLParser } from "fast-xml-parser";
import { MAX_OPML_BYTES } from "../../shared/index.ts";
import { type Database, feedFolders, feeds } from "../db/index.ts";

import { FeedError } from "./errors.ts";

/**
 * OPML 2.0 import/export for subscriptions.
 */

export interface OpmlOutline {
	title?: string;
	text?: string;
	xmlUrl?: string;
	htmlUrl?: string;
	type?: string;
}

export interface OpmlDocument {
	title: string;
	/** folder name -> outlines (feeds). Flat outlines (no folder) go in "" */
	folders: Record<string, OpmlOutline[]>;
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function outlineToXml(outline: OpmlOutline, indent: string): string {
	const attrs: string[] = [];
	if (outline.text) attrs.push(`text="${escapeXml(outline.text)}"`);
	if (outline.title) attrs.push(`title="${escapeXml(outline.title)}"`);
	if (outline.xmlUrl) attrs.push(`xmlUrl="${escapeXml(outline.xmlUrl)}"`);
	if (outline.htmlUrl) attrs.push(`htmlUrl="${escapeXml(outline.htmlUrl)}"`);
	if (outline.type) attrs.push(`type="${escapeXml(outline.type)}"`);
	return `${indent}<outline ${attrs.join(" ")} />`;
}

/** Generate an OPML 2.0 document for the current subscriptions. */
export function buildOpml(doc: OpmlDocument): string {
	const lines: string[] = [];
	lines.push('<?xml version="1.0" encoding="UTF-8"?>');
	lines.push('<opml version="2.0">');
	lines.push("  <head>");
	lines.push(`    <title>${escapeXml(doc.title)}</title>`);
	lines.push("  </head>");
	lines.push("  <body>");

	for (const [folderName, outlines] of Object.entries(doc.folders)) {
		if (folderName && outlines.length > 0) {
			lines.push(`    <outline text="${escapeXml(folderName)}">`);
			for (const outline of outlines) lines.push(outlineToXml(outline, "      "));
			lines.push("    </outline>");
		} else {
			for (const outline of outlines) lines.push(outlineToXml(outline, "    "));
		}
	}

	lines.push("  </body>");
	lines.push("</opml>");
	return lines.join("\n");
}

interface RawOutline {
	"@_text"?: string;
	"@_title"?: string;
	"@_xmlUrl"?: string;
	"@_htmlUrl"?: string;
	"@_type"?: string;
	outline?: RawOutline | RawOutline[];
}

function normalizeOutline(raw: RawOutline): OpmlOutline {
	return {
		title: raw["@_title"] ?? raw["@_text"],
		text: raw["@_text"] ?? raw["@_title"],
		xmlUrl: raw["@_xmlUrl"],
		htmlUrl: raw["@_htmlUrl"],
		type: raw["@_type"],
	};
}

/** Parse an OPML document into folders of feed outlines. */
export function parseOpml(xml: string): OpmlDocument {
	if (xml.length > MAX_OPML_BYTES) {
		throw new FeedError("OPML document too large", "OPML_TOO_LARGE");
	}
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "@_",
		parseTagValue: false,
	});
	const parsed = parser.parse(xml) as {
		opml?: { head?: { title?: string }; body?: { outline?: RawOutline | RawOutline[] } };
	};

	const body = parsed.opml?.body;
	const title = parsed.opml?.head?.title ?? "Imported feeds";
	const folders: Record<string, OpmlOutline[]> = {};

	const bodyOutlines = body?.outline;
	if (!bodyOutlines) return { title, folders };

	const outlines = Array.isArray(bodyOutlines) ? bodyOutlines : [bodyOutlines];
	for (const outline of outlines) {
		if (!outline) continue;
		const childOutlines = outline.outline;
		if (childOutlines) {
			// A folder (or a feed with nested outlines — treat as folder).
			const folderName = outline["@_text"] ?? outline["@_title"] ?? "Imported";
			const children = Array.isArray(childOutlines) ? childOutlines : [childOutlines];
			folders[folderName] = children.map(normalizeOutline).filter((o) => o.xmlUrl);
		} else {
			// A flat feed outline.
			const feed = normalizeOutline(outline);
			if (feed.xmlUrl) {
				const flat = folders[""] ?? [];
				folders[""] = flat;
				flat.push(feed);
			}
		}
	}

	return { title, folders };
}

/** Serialize the current subscriptions to an OPML document. */
export async function exportOpml(db: Database): Promise<string> {
	const [feedRows, folderRows] = await Promise.all([
		db.select().from(feeds).all(),
		db.select().from(feedFolders).all(),
	]);

	const folderById = new Map(folderRows.map((f) => [f.id, f.name]));
	const folders: Record<string, OpmlOutline[]> = {};

	for (const feed of feedRows) {
		const folderName = feed.folderId !== null ? (folderById.get(feed.folderId) ?? "") : "";
		const list = folders[folderName] ?? [];
		folders[folderName] = list;
		list.push({
			text: feed.title,
			title: feed.title,
			xmlUrl: feed.url,
			htmlUrl: feed.siteUrl ?? undefined,
			type: "rss",
		});
	}

	return buildOpml({ title: "RSS Reader subscriptions", folders });
}
