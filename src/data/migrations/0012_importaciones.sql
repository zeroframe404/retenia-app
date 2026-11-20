CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_sha_idx` ON `attachments` (`sha256`);--> statement-breakpoint
CREATE TABLE `card_attachments` (
	`card_id` text NOT NULL,
	`attachment_id` text NOT NULL,
	PRIMARY KEY(`card_id`, `attachment_id`)
);
--> statement-breakpoint
CREATE TABLE `import_items` (
	`source_key` text PRIMARY KEY NOT NULL,
	`import_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `import_items_entity_idx` ON `import_items` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`file_sha256` text NOT NULL,
	`file_name` text NOT NULL,
	`subject_id` text NOT NULL,
	`at` text NOT NULL,
	`summary` text NOT NULL,
	`rejected` text DEFAULT '[]' NOT NULL,
	`annotated` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `imports_file_idx` ON `imports` (`file_sha256`);--> statement-breakpoint
ALTER TABLE `cards` ADD `available_only` integer DEFAULT 0 NOT NULL;