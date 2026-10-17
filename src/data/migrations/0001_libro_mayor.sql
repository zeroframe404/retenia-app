CREATE TABLE `evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`version` integer NOT NULL,
	`supersedes_id` text,
	`verdict` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`time_zone` text NOT NULL,
	`device_id` text NOT NULL,
	`seq` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `observations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evaluations_attempt_version_unique` ON `evaluations` (`attempt_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `evaluations_device_seq_unique` ON `evaluations` (`device_id`,`seq`);--> statement-breakpoint
CREATE TABLE `ledger_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`last_seq` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`occurred_at` text NOT NULL,
	`recorded_at` text NOT NULL,
	`time_zone` text NOT NULL,
	`device_id` text NOT NULL,
	`seq` integer NOT NULL,
	`payload` text NOT NULL,
	`schema_version` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`source` text NOT NULL,
	`card_id` text GENERATED ALWAYS AS (json_extract(payload, '$.cardId')) VIRTUAL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `observations_idempotency_key_unique` ON `observations` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `observations_device_seq_unique` ON `observations` (`device_id`,`seq`);--> statement-breakpoint
CREATE INDEX `observations_kind_occurred_idx` ON `observations` (`kind`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `observations_card_idx` ON `observations` (`card_id`,`seq`);--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`version_before_id` text,
	`version_after_id` text,
	`trash_entry_id` text,
	`undoes_id` text,
	`source` text NOT NULL,
	`occurred_at` text NOT NULL,
	`recorded_at` text NOT NULL,
	`time_zone` text NOT NULL,
	`device_id` text NOT NULL,
	`seq` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operations_device_seq_unique` ON `operations` (`device_id`,`seq`);--> statement-breakpoint
CREATE INDEX `operations_entity_idx` ON `operations` (`entity_type`,`entity_id`,`seq`);--> statement-breakpoint
CREATE TABLE `purge_permits` (
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	PRIMARY KEY(`entity_type`, `entity_id`)
);
--> statement-breakpoint
CREATE TABLE `trash_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`deleted_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`restored_at` text,
	`purged_at` text
);
--> statement-breakpoint
CREATE INDEX `trash_entries_expires_idx` ON `trash_entries` (`expires_at`);--> statement-breakpoint
CREATE INDEX `trash_entries_entity_idx` ON `trash_entries` (`entity_type`,`entity_id`);