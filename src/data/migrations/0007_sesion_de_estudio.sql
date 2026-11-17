CREATE TABLE `doubts` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`card_id` text,
	`session_id` text,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `doubts_created_idx` ON `doubts` (`created_at`);--> statement-breakpoint
CREATE TABLE `session_drafts` (
	`session_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`answer_shown` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`session_id`, `activity_id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `observations` ADD `session_id` text GENERATED ALWAYS AS (json_extract(payload, '$.sessionId')) VIRTUAL;--> statement-breakpoint
CREATE INDEX `observations_session_idx` ON `observations` (`session_id`,`seq`);