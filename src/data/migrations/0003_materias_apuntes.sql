CREATE TABLE `block_links` (
	`block_id` text NOT NULL,
	`target_note_id` text NOT NULL,
	PRIMARY KEY(`block_id`, `target_note_id`),
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `block_links_target_idx` ON `block_links` (`target_note_id`);--> statement-breakpoint
CREATE TABLE `block_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`content` text NOT NULL,
	`text_plain` text NOT NULL,
	`created_at` text NOT NULL,
	`cause` text DEFAULT 'edit' NOT NULL,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `block_versions_block_idx` ON `block_versions` (`block_id`);--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`parent_block_id` text,
	`position` integer NOT NULL,
	`collapsed` integer DEFAULT false NOT NULL,
	`current_version_id` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `blocks_note_parent_idx` ON `blocks` (`note_id`,`parent_block_id`,`position`);--> statement-breakpoint
CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `images_sha256_unique` ON `images` (`sha256`);--> statement-breakpoint
CREATE TABLE `inbox_items` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	`moved_to_note_id` text,
	`moved_at` text,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`topic_id` text,
	`title` text DEFAULT '' NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notes_subject_topic_idx` ON `notes` (`subject_id`,`topic_id`);--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'maintenance' NOT NULL,
	`is_example` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `topic_aliases` (
	`topic_id` text NOT NULL,
	`name` text NOT NULL,
	`since` text NOT NULL,
	PRIMARY KEY(`topic_id`, `name`),
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `topics_subject_idx` ON `topics` (`subject_id`);--> statement-breakpoint
ALTER TABLE `operations` ADD `detail` text;