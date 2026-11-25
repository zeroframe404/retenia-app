ALTER TABLE `card_versions` ADD `activity_type` text;--> statement-breakpoint
ALTER TABLE `card_versions` ADD `activity` text;--> statement-breakpoint
ALTER TABLE `card_versions` ADD `example` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `card_versions` ADD `mode` text DEFAULT 'practice' NOT NULL;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `proposed_verdict` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `rubric_version` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `content_version_id` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `components` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `certainty` text DEFAULT 'certain' NOT NULL;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `engine_signal` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `cause` text DEFAULT 'graded' NOT NULL;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `appeal_reason` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `affected` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `amendment_id` text;--> statement-breakpoint
ALTER TABLE `evaluations` ADD `undoes_amendment_id` text;