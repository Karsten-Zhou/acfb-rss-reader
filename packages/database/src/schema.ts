import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
};

export const feeds = sqliteTable('feeds', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  siteUrl: text('site_url'),
  etag: text('etag'),
  lastModified: text('last_modified'),
  healthStatus: text('health_status').notNull().default('unknown'),
  ...timestamps,
}, (table) => [uniqueIndex('feeds_url_unique').on(table.url)]);

export const feedFolders = sqliteTable('feed_folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ...timestamps,
});

export const entries = sqliteTable('entries', {
  id: text('id').primaryKey(),
  feedId: text('feed_id').notNull().references(() => feeds.id),
  externalId: text('external_id').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  author: text('author'),
  publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
  ...timestamps,
});

export const entryContents = sqliteTable('entry_contents', {
  entryId: text('entry_id').primaryKey().references(() => entries.id),
  contentHtml: text('content_html').notNull(),
  sanitizedHtml: text('sanitized_html').notNull(),
  previewText: text('preview_text').notNull(),
  ...timestamps,
});

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ...timestamps,
}, (table) => [uniqueIndex('tags_name_unique').on(table.name)]);

export const starred = sqliteTable('starred', {
  entryId: text('entry_id').primaryKey().references(() => entries.id),
  ...timestamps,
});

export const readStatus = sqliteTable('read_status', {
  entryId: text('entry_id').primaryKey().references(() => entries.id),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  readAt: integer('read_at', { mode: 'timestamp_ms' }),
  ...timestamps,
});

export const refreshJobs = sqliteTable('refresh_jobs', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  triggeredBy: text('triggered_by').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  ...timestamps,
});

export const fetchLogs = sqliteTable('fetch_logs', {
  id: text('id').primaryKey(),
  feedId: text('feed_id').references(() => feeds.id),
  statusCode: integer('status_code'),
  success: integer('success', { mode: 'boolean' }).notNull(),
  error: text('error'),
  durationMs: integer('duration_ms'),
  ...timestamps,
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  githubUserId: text('github_user_id').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  ...timestamps,
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  ...timestamps,
});
