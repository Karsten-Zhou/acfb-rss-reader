/**
 * Safe YouTube embed support.
 *
 * Feed HTML may contain YouTube embeds (e.g. Steam's `data-youtube` blocks or
 * plain `<iframe>` elements). Rather than allowing `<iframe>` through the
 * sanitizer generically, we:
 *
 *   1. detect + validate video IDs before sanitization,
 *   2. replace the source elements with a safe `<youtube-embed data-id>` marker,
 *   3. sanitize (DOMPurify keeps custom elements like `youtube-embed`),
 *   4. expand the marker into our own iframe markup (youtube-nocookie.com),
 *      never reusing any `src` from the input HTML.
 *
 * The transform is string-based so it works everywhere (including tests)
 * and cannot be bypassed by DOM quirks. Unknown/malformed embeds are left
 * untouched and are stripped by the sanitizer as before.
 */

/** Valid YouTube video IDs are exactly 11 chars of `[A-Za-z0-9_-]`. */
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extract a video ID from common YouTube URLs:
 * youtube.com/embed|v|shorts|live/<id>, youtu.be/<id>, youtube.com/watch?v=<id>
 */
export function extractYouTubeId(src: string): string | null {
	const match = src.match(
		/(?:youtube(?:-nocookie)?\.com\/(?:embed|v|shorts|live)\/|youtu\.be\/|youtube\.com\/watch\?(?:[^#]*&)?v=)([A-Za-z0-9_-]{11})/,
	);
	const id = match?.[1];
	return id && YOUTUBE_ID_RE.test(id) ? id : null;
}

/**
 * Parse Steam-style `data-youtube` attribute values. The attribute contains a
 * JSON-encoded string (`"ID"`) or array of IDs (`["ID1","ID2"]`). HTML entity
 * encoding is decoded by the browser, so the replacements below only matter
 * for string-level callers/tests.
 */
export function parseDataYouTubeIds(raw: string): string[] {
	const decoded = raw.replace(/&quot;/g, '"').replace(/&#34;/g, '"');
	let parsed: unknown;
	try {
		parsed = JSON.parse(decoded);
	} catch {
		return [];
	}
	const ids: string[] = [];
	for (const candidate of Array.isArray(parsed) ? parsed : [parsed]) {
		if (typeof candidate === "string" && YOUTUBE_ID_RE.test(candidate)) ids.push(candidate);
	}
	return ids;
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

/** Replace sanitized `<youtube-embed data-id="...">` markers with iframes. */
export function expandYouTubeMarkers(html: string): string {
	return html.replace(
		/<youtube-embed data-id="([A-Za-z0-9_-]{11})"><\/youtube-embed>/g,
		(_match, id: string) => youtubeEmbedHtml(id),
	);
}

const YOUTUBE_BLOCK_RE = /<([a-z][a-z0-9-]*)[^>]*\sdata-youtube="([^"]*)"[^>]*>[\s\S]*?<\/\1>/gi;
const YOUTUBE_IFRAME_RE = /<iframe\b[^>]*\bsrc="([^"]*)"[^>]*>(?:[\s\S]*?<\/iframe>|\/>)/gi;

/**
 * Pre-sanitization transform: find YouTube embeds (Steam `data-youtube`
 * blocks and standalone iframes) and swap them for `<youtube-embed>` markers.
 * Non-YouTube iframes are left untouched (the sanitizer strips them).
 */
export function transformYouTubeEmbeds(html: string): string {
	// 1. Whole elements carrying a data-youtube attribute (Steam blocks) —
	//    through their matching closing tag. Their inner iframe disappears
	//    with them, so there is no double handling.
	let out = html.replace(YOUTUBE_BLOCK_RE, (_match, _tag: string, raw: string) =>
		parseDataYouTubeIds(raw)
			.map((id) => `<youtube-embed data-id="${id}"></youtube-embed>`)
			.join(""),
	);

	// 2. Standalone iframes whose src is a recognized YouTube URL.
	out = out.replace(YOUTUBE_IFRAME_RE, (match, src: string) => {
		const id = extractYouTubeId(src);
		return id ? `<youtube-embed data-id="${id}"></youtube-embed>` : match;
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
