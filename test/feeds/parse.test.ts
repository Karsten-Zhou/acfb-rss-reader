import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { parseFeedDocument } from "../../server/feeds/parse.ts";

const rss = readFileSync(new URL("./fixtures/rss.xml", import.meta.url), "utf8");
const atom = readFileSync(new URL("./fixtures/atom.xml", import.meta.url), "utf8");
const json = readFileSync(new URL("./fixtures/feed.json", import.meta.url), "utf8");

test("parses RSS 2.0 with content and author", () => {
	const parsed = parseFeedDocument(rss, "https://example.com/feed.xml");

	expect(parsed.feedType).toBe("rss");
	expect(parsed.title).toBe("Example Feed");
	expect(parsed.siteUrl).toBe("https://example.com");
	expect(parsed.entries).toHaveLength(2);

	const first = parsed.entries[0]!;
	expect(first.guid).toBe("hello-world-001");
	expect(first.title).toBe("Hello World");
	expect(first.url).toBe("https://example.com/articles/hello");
	expect(first.author).toBe("Jane Doe");
	expect(first.content).toContain("<p>Full article content</p>");
	expect(first.summary).toContain("Short summary");
	expect(first.imageUrl).toBe("https://example.com/img/hello.png");
	expect(first.publishedAt?.toISOString()).toBe("2026-08-14T09:30:00.000Z");

	const second = parsed.entries[1]!;
	expect(second.content).toContain("Just a summary");
});

test("parses Atom with content and author", () => {
	const parsed = parseFeedDocument(atom, "https://atomexample.com/feed.xml");

	expect(parsed.feedType).toBe("atom");
	expect(parsed.title).toBe("Atom Example");
	expect(parsed.entries).toHaveLength(2);

	const first = parsed.entries[0]!;
	expect(first.title).toBe("Atom Entry One");
	expect(first.url).toBe("https://atomexample.com/posts/one");
	expect(first.author).toBe("Alice Smith");
	expect(first.content).toContain("<p>Atom full content");
	expect(first.summary).toContain("A short summary");
	expect(first.publishedAt?.toISOString()).toBe("2026-08-14T09:00:00.000Z");
});

test("parses JSON Feed with content_html and authors", () => {
	const parsed = parseFeedDocument(json, "https://jsonexample.com/feed.json");

	expect(parsed.feedType).toBe("json");
	expect(parsed.title).toBe("JSON Example");
	expect(parsed.siteUrl).toBe("https://jsonexample.com");
	expect(parsed.entries).toHaveLength(2);

	const first = parsed.entries[0]!;
	expect(first.guid).toBe("json-entry-1");
	expect(first.title).toBe("JSON Entry One");
	expect(first.author).toBe("Carol");
	expect(first.content).toContain("<p>JSON full content");
	expect(first.imageUrl).toBe("https://jsonexample.com/img/one.png");
});

test("throws on malformed input", () => {
	expect(() =>
		parseFeedDocument("<html><body>not a feed</body></html>", "https://x.example/f"),
	).toThrow();
});
