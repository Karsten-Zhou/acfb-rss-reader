/**
 * Safe YouTube embed support.
 *
 * Feed HTML may contain YouTube embeds (e.g. Steam's `data-youtube` blocks or
 * plain `<iframe>` elements). Rather than allowing `<iframe>` through the
 * sanitizer generically, we:
 *
 *   1. detect + validate video IDs before sanitization,
 *   2. replace the source elements with a safe `<span data-yt-id>` marker
 *      (a standard element + data attribute, which DOMPurify keeps — unlike
 *      custom elements, which it strips by default),
 *   3. sanitize,
 *   4. expand the marker into our own iframe markup (youtube-nocookie.com),
 *      never reusing any `src` from the input HTML.
 *
 * The transform is string-based so it works everywhere (including tests)
 * and cannot be bypassed by DOM quirks. Unknown/malformed embeds are left
 * untouched and are stripped by the sanitizer as before.
 */

/** Valid YouTube video IDs are exactly 11 chars of `[A-Za-z0-9_-]`. */
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Decode the HTML-entity-escaped quotes Steam uses around its ids. */
function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&#34;/g, '"')
		.replace(/&#x22;/gi, '"');
}

/**
 * Extract a video ID from common YouTube URLs:
 * youtube.com/embed|v|shorts|live/<id>, youtu.be/<id>, youtube.com/watch?v=<id>
 *
 * Tolerant of Steam's raw markup, where the id may be preceded by a stray
 * `&quot;` entity (decoded below) — we grab the first valid 11-char id after
 * the URL pattern instead of requiring a perfect match.
 */
export function extractYouTubeId(src: string): string | null {
	const decoded = decodeHtmlEntities(src);
	const m = decoded.match(
		/(?:youtube(?:-nocookie)?\.com\/(?:embed|v|shorts|live)\/|youtu\.be\/|youtube\.com\/watch\?(?:[^#]*&)?v=)/i,
	);
	if (!m || m.index === undefined) return null;
	const tail = decoded.slice(m.index + m[0].length);
	const id = tail.match(/[A-Za-z0-9_-]{11}/)?.[0];
	return id && YOUTUBE_ID_RE.test(id) ? id : null;
}

/**
 * Parse Steam-style `data-youtube` attribute values. The attribute contains a
 * JSON-encoded string (`"ID"`) or array of IDs (`["ID1","ID2"]`), usually with
 * HTML-entity-escaped quotes. Steam also emits a malformed single-quote form
 * (`&quot;ID` with no closing quote), so we fall back to grabbing any valid
 * 11-char id from the decoded value.
 */
export function parseDataYouTubeIds(raw: string): string[] {
	const decoded = decodeHtmlEntities(raw).trim();
	let parsed: unknown;
	try {
		parsed = JSON.parse(decoded);
	} catch {
		// Malformed (e.g. Steam's stray single quote) — grab any valid id below.
		return decoded.match(/[A-Za-z0-9_-]{11}/g)?.filter((id) => YOUTUBE_ID_RE.test(id)) ?? [];
	}
	const candidates = Array.isArray(parsed) ? parsed : [parsed];
	return candidates.filter((c): c is string => typeof c === "string" && YOUTUBE_ID_RE.test(c));
}

/** iframe markup generated internally — never derived from input HTML. */
export function youtubeEmbedHtml(id: string): string {
	return (
		`<iframe src="https://www.youtube-nocookie.com/embed/${id}" ` +
		'title="YouTube video player" frameborder="0" ' +
		'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
		'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe>'
	);
}

/** Replace sanitized `<span data-yt-id="...">` markers with iframes. */
export function expandYouTubeMarkers(html: string): string {
	return html.replace(
		/<span\b[^>]*\bdata-yt-id="([A-Za-z0-9_-]{11})"[^>]*><\/span>/g,
		(_match, id: string) => youtubeEmbedHtml(id),
	);
}

const YOUTUBE_BLOCK_RE = /<([a-z][a-z0-9-]*)[^>]*\sdata-youtube="([^"]*)"[^>]*>[\s\S]*?<\/\1>/gi;
const YOUTUBE_IFRAME_RE = /<iframe\b[^>]*\bsrc="([^"]*)"[^>]*>(?:[\s\S]*?<\/iframe>|\/>)/gi;

/**
 * Pre-sanitization transform: find YouTube embeds (Steam `data-youtube`
 * blocks and standalone iframes) and swap them for `<span data-yt-id>`
 * markers. Non-YouTube iframes are left untouched (the sanitizer strips them).
 */
export function transformYouTubeEmbeds(html: string): string {
	// 1. Whole elements carrying a data-youtube attribute (Steam blocks) —
	//    through their matching closing tag. Their inner iframe disappears
	//    with them, so there is no double handling. When the attribute is
	//    malformed and yields no id, fall back to the inner iframe's src
	//    before giving up (otherwise the block is left for the sanitizer).
	let out = html.replace(YOUTUBE_BLOCK_RE, (match, _tag: string, raw: string) => {
		let ids = parseDataYouTubeIds(raw);
		if (ids.length === 0) {
			const iframe = match.match(YOUTUBE_IFRAME_RE)?.[0];
			const id = iframe ? extractYouTubeId(iframe) : null;
			ids = id ? [id] : [];
		}
		return ids.length > 0 ? ids.map((id) => `<span data-yt-id="${id}"></span>`).join("") : match;
	});

	// 2. Standalone iframes whose src is a recognized YouTube URL.
	out = out.replace(YOUTUBE_IFRAME_RE, (match, src: string) => {
		const id = extractYouTubeId(src);
		return id ? `<span data-yt-id="${id}"></span>` : match;
	});

	return out;
}

/** Full pipeline used by the reader: transform → the caller sanitizes → expand. */
export function sanitizeSafeYouTubePipeline(
	html: string,
	sanitize: (raw: string) => string,
): string {
	return expandYouTubeMarkers(sanitize(transformYouTubeEmbeds(html)));
}
