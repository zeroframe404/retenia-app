CREATE TABLE `ingest_results` (
	`key` text PRIMARY KEY NOT NULL,
	`original_sha256` text NOT NULL,
	`unit_no` integer NOT NULL,
	`stage` text NOT NULL,
	`tool` text NOT NULL,
	`tool_version` text NOT NULL,
	`params` text NOT NULL,
	`output` blob NOT NULL,
	`output_sha256` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ingest_results_original_idx` ON `ingest_results` (`original_sha256`);--> statement-breakpoint
CREATE TABLE `ingest_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`material_id` text NOT NULL,
	`stage` text NOT NULL,
	`stage_order` integer NOT NULL,
	`unit_no` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`recoveries` integer DEFAULT 0 NOT NULL,
	`runner_id` text,
	`heartbeat_at` integer,
	`last_problem` text,
	`result_key` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ingest_tasks_status_idx` ON `ingest_tasks` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `ingest_tasks_material_idx` ON `ingest_tasks` (`material_id`,`stage_order`,`unit_no`);--> statement-breakpoint
CREATE TABLE `material_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`material_id` text NOT NULL,
	`parent_id` text,
	`position` integer NOT NULL,
	`type` text NOT NULL,
	`level` integer DEFAULT 0 NOT NULL,
	`unit_no` integer NOT NULL,
	`raw_text` text NOT NULL,
	`normalized_text` text NOT NULL,
	`transformations` text DEFAULT '[]' NOT NULL,
	`locator` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `material_blocks_unit_idx` ON `material_blocks` (`material_id`,`unit_no`);--> statement-breakpoint
CREATE INDEX `material_blocks_position_idx` ON `material_blocks` (`material_id`,`position`);--> statement-breakpoint
CREATE TABLE `material_units` (
	`material_id` text NOT NULL,
	`unit_no` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`char_count` integer DEFAULT 0 NOT NULL,
	`paragraph_count` integer DEFAULT 0 NOT NULL,
	`width` real,
	`height` real,
	PRIMARY KEY(`material_id`, `unit_no`)
);
--> statement-breakpoint
CREATE TABLE `materials` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text,
	`original_sha256` text,
	`original_name` text NOT NULL,
	`original_ext` text,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`unit_count` integer,
	`previous_material_id` text,
	`version_no` integer DEFAULT 1 NOT NULL,
	`pipeline_version` integer DEFAULT 1 NOT NULL,
	`added_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `materials_sha_idx` ON `materials` (`original_sha256`);--> statement-breakpoint
CREATE INDEX `materials_subject_idx` ON `materials` (`subject_id`,`added_at`);--> statement-breakpoint
ALTER TABLE `card_versions` ADD `source_cite` text;--> statement-breakpoint
ALTER TABLE `inbox_items` ADD `source` text;--> statement-breakpoint
-- Los resultados de cada etapa solo se agregan: nadie los cambia ni los borra.
CREATE TRIGGER `ingest_results_no_update` BEFORE UPDATE ON `ingest_results` BEGIN SELECT RAISE(ABORT, 'los resultados de la cadena solo se agregan: uno no se modifica'); END;
--> statement-breakpoint
CREATE TRIGGER `ingest_results_no_delete` BEFORE DELETE ON `ingest_results` BEGIN SELECT RAISE(ABORT, 'los resultados de la cadena solo se agregan: uno no se borra'); END;
--> statement-breakpoint
-- El buscador (Fase 12) se entera de lo que cambia en los materiales y en sus bloques: cada cambio
-- anota el material, y al vaciar lo anotado se rearman el material y sus secciones.
CREATE TRIGGER `search_dirty_materials_ai` AFTER INSERT ON `materials` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('material', NEW.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_materials_au` AFTER UPDATE ON `materials` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('material', NEW.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_materials_ad` AFTER DELETE ON `materials` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('material', OLD.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_material_blocks_ai` AFTER INSERT ON `material_blocks` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('material', NEW.`material_id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_material_blocks_au` AFTER UPDATE ON `material_blocks` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('material', NEW.`material_id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_material_blocks_ad` AFTER DELETE ON `material_blocks` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('material', OLD.`material_id`); END;
