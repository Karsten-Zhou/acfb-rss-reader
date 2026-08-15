ALTER TABLE `feeds` ADD `position` integer DEFAULT 0 NOT NULL;

-- Backfill positions so existing feeds keep a stable, insertion-ordered sidebar order.
UPDATE `feeds` SET `position` = `id`;