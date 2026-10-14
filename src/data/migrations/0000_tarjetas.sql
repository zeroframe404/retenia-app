CREATE TABLE `card_schedule` (
	`card_id` text PRIMARY KEY NOT NULL,
	`state` integer NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`due_at` text NOT NULL,
	`last_review_at` text,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`scheduled_days` integer DEFAULT 0 NOT NULL,
	`retention_target` real DEFAULT 0.9 NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `card_schedule_due_idx` ON `card_schedule` (`due_at`);--> statement-breakpoint
CREATE TABLE `card_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`created_at` text NOT NULL,
	`cause` text DEFAULT 'edit' NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `card_versions_card_idx` ON `card_versions` (`card_id`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`current_version_id` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `cards_created_idx` ON `cards` (`created_at`,`id`);