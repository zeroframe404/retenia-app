ALTER TABLE `card_versions` ADD `question_content` text;--> statement-breakpoint
ALTER TABLE `card_versions` ADD `answer_content` text;--> statement-breakpoint
ALTER TABLE `card_versions` ADD `reference_answer` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `card_versions` ADD `variants` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `card_versions` ADD `essentials` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `card_versions` ADD `hints` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `card_versions` ADD `explanation` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `card_versions` ADD `source_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `card_versions` ADD `form_type` text DEFAULT 'exact' NOT NULL;--> statement-breakpoint
ALTER TABLE `card_versions` ADD `sheet_state` text DEFAULT 'reviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `subject_id` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `topic_id` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `note_id` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `block_id` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `cloze_id` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `kind` text DEFAULT 'qa' NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `origin` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `sibling_group_id` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `inverse_of_card_id` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `paused_at` text;--> statement-breakpoint
ALTER TABLE `cards` ADD `detached_at` text;--> statement-breakpoint
CREATE INDEX `cards_subject_topic_idx` ON `cards` (`subject_id`,`topic_id`);--> statement-breakpoint
CREATE INDEX `cards_block_idx` ON `cards` (`block_id`);