CREATE TABLE `block_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`material_id` text NOT NULL,
	`unit_no` integer NOT NULL,
	`block_key` text NOT NULL,
	`before_text` text NOT NULL,
	`after_text` text NOT NULL,
	`state` text DEFAULT 'applied' NOT NULL,
	`pending_cards` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `block_corrections_material_idx` ON `block_corrections` (`material_id`,`unit_no`);--> statement-breakpoint
CREATE TABLE `problem_resolutions` (
	`material_id` text NOT NULL,
	`unit_no` integer NOT NULL,
	`problem_key` text NOT NULL,
	`resolution` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`material_id`, `unit_no`, `problem_key`)
);
--> statement-breakpoint
ALTER TABLE `material_blocks` ADD `base_text` text;--> statement-breakpoint
ALTER TABLE `material_units` ADD `excluded` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `material_units` ADD `text_source` text DEFAULT 'pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE `material_units` ADD `ocr_confidence` real;--> statement-breakpoint
ALTER TABLE `material_units` ADD `generation` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `materials` ADD `source_url` text;--> statement-breakpoint
ALTER TABLE `materials` ADD `snapshot_at` text;--> statement-breakpoint
ALTER TABLE `materials` ADD `pending_network` integer DEFAULT 0 NOT NULL;