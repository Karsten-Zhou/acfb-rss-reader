import { expect, test } from "bun:test";

import { normalizeUrl, resolveRsshubUrl } from "../shared/index.ts";

test("resolveRsshubUrl maps a route to the default public instance", () => {
	expect(resolveRsshubUrl("rsshub://zhihu/daily")).toBe("https://rsshub.app/zhihu/daily");
	expect(resolveRsshubUrl("rsshub:///zhihu/daily")).toBe("https://rsshub.app/zhihu/daily");
	expect(resolveRsshubUrl("rsshub://rsshub.app/zhihu/daily")).toBe(
		"https://rsshub.app/zhihu/daily",
	);
});

test("resolveRsshubUrl maps a host with a dot or localhost to a custom instance", () => {
	expect(resolveRsshubUrl("rsshub://rsshub.feed.fans/zhihu/daily")).toBe(
		"https://rsshub.feed.fans/zhihu/daily",
	);
	expect(resolveRsshubUrl("rsshub://localhost:1200/zhihu/daily")).toBe(
		"https://localhost:1200/zhihu/daily",
	);
});

test("resolveRsshubUrl leaves ordinary URLs untouched", () => {
	expect(resolveRsshubUrl("https://example.com/feed.xml")).toBe("https://example.com/feed.xml");
	expect(resolveRsshubUrl("  http://a.b/x  ")).toBe("http://a.b/x");
	expect(resolveRsshubUrl("example.com/feed.xml")).toBe("example.com/feed.xml");
});

test("resolveRsshubUrl feeds a valid URL into normalizeUrl", () => {
	const resolved = resolveRsshubUrl("rsshub://zhihu/daily");
	expect(normalizeUrl(resolved)).toBe("https://rsshub.app/zhihu/daily");
});
