CREATE TABLE `entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`feed_id` integer NOT NULL,
	`guid` text NOT NULL,
	`url` text,
	`title` text NOT NULL,
	`author` text,
	`summary` text,
	`image_url` text,
	`published_at` integer,
	`updated_at` integer,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_feed_guid_idx` ON `entries` (`feed_id`,`guid`);--> statement-breakpoint
CREATE INDEX `entries_feed_published_idx` ON `entries` (`feed_id`,`published_at`);--> statement-breakpoint
CREATE INDEX `entries_published_idx` ON `entries` (`published_at`);--> statement-breakpoint
CREATE TABLE `entry_contents` (
	`entry_id` integer PRIMARY KEY NOT NULL,
	`content` text,
	`content_text` text,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `entry_tags` (
	`entry_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`entry_id`, `tag_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entry_tags_tag_idx` ON `entry_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `read_status` (
	`entry_id` integer PRIMARY KEY NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`read_at` integer,
	`archived` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `starred` (
	`entry_id` integer PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `feed_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feeds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`site_url` text,
	`title` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'rss' NOT NULL,
	`favicon_url` text,
	`folder_id` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`etag` text,
	`last_modified` text,
	`last_fetched_at` integer,
	`next_fetch_at` integer,
	`status` text DEFAULT 'ok' NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `feed_folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feeds_url_unique` ON `feeds` (`url`);--> statement-breakpoint
CREATE INDEX `feeds_folder_idx` ON `feeds` (`folder_id`);--> statement-breakpoint
CREATE INDEX `feeds_status_idx` ON `feeds` (`status`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`entry_id` integer NOT NULL,
	`notification_type` text DEFAULT 'new-feed-entry' NOT NULL,
	`status` text DEFAULT 'sending' NOT NULL,
	`created_at` integer NOT NULL,
	`delivered_at` integer,
	`target_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`entry_id`, `notification_type`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_deliveries_type_idx` ON `notification_deliveries` (`notification_type`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`endpoint` text NOT NULL,
	`expiration_time` integer,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_delivered_at` integer,
	`last_failure_at` integer,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE VIRTUAL TABLE `entries_fts` USING fts5(`entry_id` UNINDEXED, `title`, `content`, `author`, `feed_title`, `tags`, tokenize = 'porter unicode61');--> statement-breakpoint
CREATE TABLE `fetch_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`feed_id` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`duration_ms` integer,
	`new_entries` integer DEFAULT 0 NOT NULL,
	`error` text,
	`etag` text,
	`last_modified` text,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fetch_logs_feed_idx` ON `fetch_logs` (`feed_id`,`fetched_at`);--> statement-breakpoint
CREATE TABLE `refresh_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`error` text,
	`stats` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
