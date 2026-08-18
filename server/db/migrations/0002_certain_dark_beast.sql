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
	`user_id` integer NOT NULL,
	`endpoint` text NOT NULL,
	`expiration_time` integer,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_delivered_at` integer,
	`last_failure_at` integer,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);