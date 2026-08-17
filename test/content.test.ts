import { expect, test } from "bun:test";

import { decorateImageTag, transformImagesToPlaceholders } from "../src/lib/content.ts";

test("decorateImageTag adds reader-img class and lazy loading", () => {
	expect(decorateImageTag("", ">")).toBe('<img class="reader-img" loading="lazy">');
});

test("decorateImageTag merges into an existing class", () => {
	expect(decorateImageTag(' class="foo"', ">")).toBe('<img class="foo reader-img" loading="lazy">');
});

test("decorateImageTag respects an existing loading attribute", () => {
	expect(decorateImageTag(' loading="eager"', ">")).toBe(
		'<img loading="eager" class="reader-img">',
	);
});

test("transformImagesToPlaceholders decorates every plain img", () => {
	const html = '<p><img src="a.png"><img src="b.png" class="x" /></p>';
	const out = transformImagesToPlaceholders(html);
	expect(out).toBe(
		'<p><img src="a.png" class="reader-img" loading="lazy">' +
			'<img src="b.png" class="x reader-img" loading="lazy" /></p>',
	);
});

test("transformImagesToPlaceholders leaves self-closing and void tags intact", () => {
	const out = transformImagesToPlaceholders('<img src="c.gif" />');
	expect(out).toBe('<img src="c.gif" class="reader-img" loading="lazy" />');
});
