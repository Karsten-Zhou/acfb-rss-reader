import { relations } from "drizzle-orm";

import { sessions, users } from "./auth.ts";
import { entries, entryContents, entryTags, readStatus, starred, tags } from "./entries.ts";
import { feedFolders, feeds } from "./feeds.ts";
import { fetchLogs } from "./system.ts";

export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const feedFoldersRelations = relations(feedFolders, ({ many }) => ({
	feeds: many(feeds),
}));

export const feedsRelations = relations(feeds, ({ one, many }) => ({
	folder: one(feedFolders, { fields: [feeds.folderId], references: [feedFolders.id] }),
	entries: many(entries),
	fetchLogs: many(fetchLogs),
}));

export const entriesRelations = relations(entries, ({ one, many }) => ({
	feed: one(feeds, { fields: [entries.feedId], references: [feeds.id] }),
	content: one(entryContents, { fields: [entries.id], references: [entryContents.entryId] }),
	readStatus: one(readStatus, { fields: [entries.id], references: [readStatus.entryId] }),
	starred: one(starred, { fields: [entries.id], references: [starred.entryId] }),
	tags: many(entryTags),
}));

export const entryContentsRelations = relations(entryContents, ({ one }) => ({
	entry: one(entries, { fields: [entryContents.entryId], references: [entries.id] }),
}));

export const entryTagsRelations = relations(entryTags, ({ one }) => ({
	entry: one(entries, { fields: [entryTags.entryId], references: [entries.id] }),
	tag: one(tags, { fields: [entryTags.tagId], references: [tags.id] }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
	entries: many(entryTags),
}));

export const starredRelations = relations(starred, ({ one }) => ({
	entry: one(entries, { fields: [starred.entryId], references: [entries.id] }),
}));

export const readStatusRelations = relations(readStatus, ({ one }) => ({
	entry: one(entries, { fields: [readStatus.entryId], references: [entries.id] }),
}));

export const fetchLogsRelations = relations(fetchLogs, ({ one }) => ({
	feed: one(feeds, { fields: [fetchLogs.feedId], references: [feeds.id] }),
}));
