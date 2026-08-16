import { expect, test } from "bun:test";

import {
	expandYouTubeMarkers,
	extractYouTubeId,
	parseDataYouTubeIds,
	sanitizeSafeYouTubePipeline,
	youtubeEmbedHtml,
} from "../src/lib/youtube.ts";

test("extractYouTubeId handles known URL patterns", () => {
	expect(extractYouTubeId("https://www.youtube-nocookie.com/embed/MmVoWzSyF9c?fs=1")).toBe(
		"MmVoWzSyF9c",
	);
	expect(extractYouTubeId("https://www.youtube.com/embed/MmVoWzSyF9c")).toBe("MmVoWzSyF9c");
	expect(extractYouTubeId("https://youtu.be/MmVoWzSyF9c")).toBe("MmVoWzSyF9c");
	expect(extractYouTubeId("https://www.youtube.com/watch?v=MmVoWzSyF9c&t=10")).toBe("MmVoWzSyF9c");
	expect(extractYouTubeId("https://www.youtube.com/shorts/MmVoWzSyF9c")).toBe("MmVoWzSyF9c");
	// Steam's raw src carries a stray entity quote before the id.
	expect(
		extractYouTubeId(
			"https://www.youtube-nocookie.com/embed/&quot;MmVoWzSyF9c?fs=1&modestbranding=1&rel=0",
		),
	).toBe("MmVoWzSyF9c");
});

test("extractYouTubeId rejects invalid ids and unrelated urls", () => {
	expect(extractYouTubeId("https://www.youtube.com/watch?v=tooshort")).toBeNull();
	expect(extractYouTubeId("https://example.com/video/MmVoWzSyF9c")).toBeNull();
	expect(extractYouTubeId("https://www.youtube.com/embed/MmVoWzSyF9c<script>bad()</script>")).toBe(
		"MmVoWzSyF9c",
	);
});

test("parseDataYouTubeIds handles string and array values", () => {
	expect(parseDataYouTubeIds('"MmVoWzSyF9c"')).toEqual(["MmVoWzSyF9c"]);
	expect(parseDataYouTubeIds('["MmVoWzSyF9c","AbCdEfGhIjK"]')).toEqual([
		"MmVoWzSyF9c",
		"AbCdEfGhIjK",
	]);
	// HTML-entity encoded variant as found in raw feed HTML.
	expect(parseDataYouTubeIds("&quot;MmVoWzSyF9c&quot;")).toEqual(["MmVoWzSyF9c"]);
	// Steam also emits a single leading &quot; with no closing quote (not valid
	// JSON) — the lenient fallback still finds the id.
	expect(parseDataYouTubeIds("&quot;MmVoWzSyF9c")).toEqual(["MmVoWzSyF9c"]);
	expect(parseDataYouTubeIds('"not-a-valid-id"')).toEqual([]);
	expect(parseDataYouTubeIds("not json")).toEqual([]);
});

test("youtubeEmbedHtml always uses youtube-nocookie.com and escapes nothing", () => {
	const html = youtubeEmbedHtml("MmVoWzSyF9c");
	expect(html).toContain('src="https://www.youtube-nocookie.com/embed/MmVoWzSyF9c"');
	expect(html).toContain("allowfullscreen");
	expect(html).not.toContain("youtube.com/embed/");
});

test("expandYouTubeMarkers replaces markers with iframes", () => {
	const out = expandYouTubeMarkers('<p><span data-yt-id="MmVoWzSyF9c"></span></p>');
	expect(out).toBe(`<p>${youtubeEmbedHtml("MmVoWzSyF9c")}</p>`);
	// Invalid ids are left untouched.
	expect(expandYouTubeMarkers('<span data-yt-id="bad"></span>')).toBe(
		'<span data-yt-id="bad"></span>',
	);
});

test("pipeline with a strict sanitizer only allows our generated iframes", () => {
	const input = [
		'<div onclick="javascript:ReplaceWithYouTubeEmbed(this)" data-youtube="&quot;MmVoWzSyF9c&quot;" class="sharedFilePreviewYouTubeVideo">',
		'<img src="https://steamcommunity.com/public/shared/images/responsive/youtube_16x9_placeholder.gif" />',
		'<iframe src="https://www.youtube-nocookie.com/embed/&quot;MmVoWzSyF9c?fs=1&modestbranding=1&rel=0" allowFullScreen="1" frameBorder="0"></iframe>',
		"</div>",
	].join("");

	// A "sanitizer" that mimics DOMPurify's defaults: strips iframes, event
	// handlers, javascript: urls AND custom elements (youtube-embed), but
	// keeps standard elements and data attributes.
	const fakeSanitize = (raw: string): string =>
		raw
			.replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
			.replace(/<youtube-embed[\s\S]*?<\/youtube-embed>/gi, "")
			.replace(/\son\w+="[^"]*"/gi, "")
			.replace(/href="javascript:[^"]*"/gi, "");

	const out = sanitizeSafeYouTubePipeline(input, fakeSanitize);
	expect(out).toContain('src="https://www.youtube-nocookie.com/embed/MmVoWzSyF9c"');
	expect(out).not.toContain("data-youtube");
	expect(out).not.toContain("onclick");
	expect(out).not.toContain("ReplaceWithYouTubeEmbed");
});

test("pipeline handles Steam's malformed single-quote data-youtube block", () => {
	// The exact markup reported by users: data-youtube="&quot;ID" (one leading
	// entity quote, no closing one) and a src with a stray quote.
	const input =
		'<div onclick="javascript:ReplaceWithYouTubeEmbed( this );" data-youtube="&quot;MmVoWzSyF9c" class="sharedFilePreviewYouTubeVideo">' +
		'<img class="sharedFilePreviewYouTubeVideo" src="https://steamcommunity.com/public/shared/images/responsive/youtube_16x9_placeholder.gif"/>' +
		'<iframe src="https://www.youtube-nocookie.com/embed/&quot;MmVoWzSyF9c?fs=1&modestbranding=1&rel=0" allowFullScreen="1" frameBorder="0"></iframe>' +
		"</div>";

	const fakeSanitize = (raw: string): string =>
		raw
			.replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
			.replace(/\son\w+="[^"]*"/gi, "")
			.replace(/href="javascript:[^"]*"/gi, "");

	const out = sanitizeSafeYouTubePipeline(input, fakeSanitize);
	expect(out).toContain('src="https://www.youtube-nocookie.com/embed/MmVoWzSyF9c"');
	expect(out).not.toContain("data-youtube");
	expect(out).not.toContain("onclick");
	expect(out).not.toContain("ReplaceWithYouTubeEmbed");
	expect(out).not.toContain("youtube_16x9_placeholder");
});
