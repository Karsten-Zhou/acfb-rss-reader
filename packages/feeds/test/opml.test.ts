import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";

import { createDb, feeds } from "@rss/database";
import { applyMigrations, createD1Mock } from "@rss/database/testing";

import { buildOpml, parseOpml } from "../src/opml.ts";
import { importOpml } from "../src/service.ts";

test("OPML build and parse round-trip", () => {
	const xml = buildOpml({
		title: "My feeds",
		folders: {
			"": [
				{
					text: "Flat Feed",
					title: "Flat Feed",
					xmlUrl: "https://flat.example/feed.xml",
					type: "rss",
				},
			],
			Tech: [
				{ text: "Tech Feed", title: "Tech Feed", xmlUrl: "https://tech.example/rss", type: "rss" },
				{ text: "Dev Blog", title: "Dev Blog", xmlUrl: "https://dev.example/atom", type: "rss" },
			],
		},
	});

	expect(xml).toContain('<opml version="2.0">');
	expect(xml).toContain('xmlUrl="https://tech.example/rss"');
	expect(xml).toContain('xmlUrl="https://flat.example/feed.xml"');

	const parsed = parseOpml(xml);
	expect(parsed.title).toBe("My feeds");
	expect(parsed.folders[""]).toHaveLength(1);
	expect(parsed.folders.Tech).toHaveLength(2);
	expect(parsed.folders.Tech![0]!.xmlUrl).toBe("https://tech.example/rss");
});

test("importOpml creates folders and feeds, skipping duplicates", async () => {
	const sqlite = new Database(":memory:");
	applyMigrations(sqlite);
	const db = createDb(createD1Mock(sqlite));

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Export</title></head>
  <body>
    <outline text="Tech">
      <outline text="Tech Feed" type="rss" xmlUrl="https://tech.example/rss" />
      <outline text="Dev" type="rss" xmlUrl="https://dev.example/atom" />
    </outline>
    <outline text="Flat" type="rss" xmlUrl="https://flat.example/feed.xml" />
  </body>
</opml>`;

	const first = await importOpml(db, xml);
	expect(first.created).toBe(3);
	expect(first.duplicates).toBe(0);

	const second = await importOpml(db, xml);
	expect(second.created).toBe(0);
	expect(second.duplicates).toBe(3);

	const rows = await db.select({ url: feeds.url, folderId: feeds.folderId }).from(feeds).all();
	expect(rows).toHaveLength(3);
	const folders = sqlite.query("SELECT COUNT(*) AS n FROM feed_folders").get() as { n: number };
	expect(folders.n).toBe(1);
});
