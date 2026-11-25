CREATE TABLE `objectives` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`topic_id` text,
	`title` text NOT NULL,
	`action` text NOT NULL,
	`content` text NOT NULL,
	`conditions` text,
	`kind` text NOT NULL,
	`concept_key` text NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `objectives_subject_idx` ON `objectives` (`subject_id`,`topic_id`);--> statement-breakpoint
ALTER TABLE `observations` ADD `objective_id` text GENERATED ALWAYS AS (json_extract(payload, '$.objectiveId')) VIRTUAL;--> statement-breakpoint
CREATE INDEX `observations_objective_idx` ON `observations` (`objective_id`,`seq`);