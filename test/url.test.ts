import { expect, test } from "bun:test";

import { normalizeUrl } from "../shared/index.ts";

test("normalizeUrl adds https and strips the hash", () => {
	expect(normalizeUrl("example.com/feed.xml")).toBe("https://example.com/feed.xml");
	expect(normalizeUrl("https://example.com/feed.xml#frag")).toBe("https://example.com/feed.xml");
	expect(normalizeUrl("https://example.com/feed.xml?q=1")).toBe("https://example.com/feed.xml?q=1");
});

test("normalizeUrl rejects non-http(s) protocols and invalid input", () => {
	expect(normalizeUrl("rsshub://zhihu/daily")).toBeNull();
	expect(normalizeUrl("ftp://example.com/x")).toBeNull();
	expect(normalizeUrl("")).toBeNull();
	expect(normalizeUrl("not a url")).toBeNull();
});

test("normalizeUrl trims surrounding whitespace", () => {
	expect(normalizeUrl("  https://example.com/a  ")).toBe("https://example.com/a");
});
