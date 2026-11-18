CREATE TABLE `search_dirty` (
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	PRIMARY KEY(`kind`, `entity_id`)
);
--> statement-breakpoint
CREATE TABLE `search_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doc_id` text NOT NULL,
	`kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`parent_id` text,
	`subject_id` text,
	`topic_id` text,
	`label` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`raw` text DEFAULT '' NOT NULL,
	`aliases` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`touched_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_documents_doc_idx` ON `search_documents` (`doc_id`);--> statement-breakpoint
CREATE INDEX `search_documents_subject_idx` ON `search_documents` (`subject_id`,`kind`);--> statement-breakpoint
CREATE TABLE `search_recent` (
	`doc_id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL
);
--> statement-breakpoint
-- Lo que cambia en el contenido queda anotado en `search_dirty` y el índice se actualiza en la misma
-- transacción (src/data/search.ts). Cada cuerpo va en una sola línea (la prueba de migraciones corta
-- en punto y coma con salto).
CREATE TRIGGER `search_dirty_cards_ai` AFTER INSERT ON `cards` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('card', NEW.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_cards_au` AFTER UPDATE ON `cards` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('card', NEW.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_cards_ad` AFTER DELETE ON `cards` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('card', OLD.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_card_versions_ai` AFTER INSERT ON `card_versions` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('card', NEW.`card_id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_card_versions_ad` AFTER DELETE ON `card_versions` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('card', OLD.`card_id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_notes_ai` AFTER INSERT ON `notes` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('note', NEW.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_notes_au` AFTER UPDATE ON `notes` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('note', NEW.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_notes_ad` AFTER DELETE ON `notes` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('note', OLD.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_blocks_ai` AFTER INSERT ON `blocks` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('block', NEW.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_blocks_au` AFTER UPDATE ON `blocks` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('block', NEW.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_blocks_ad` AFTER DELETE ON `blocks` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('block', OLD.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_block_versions_ai` AFTER INSERT ON `block_versions` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('block', NEW.`block_id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_block_versions_ad` AFTER DELETE ON `block_versions` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('block', OLD.`block_id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_topics_ai` AFTER INSERT ON `topics` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('topic', NEW.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_topics_au` AFTER UPDATE ON `topics` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('topic', NEW.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_topics_ad` AFTER DELETE ON `topics` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('topic', OLD.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_topic_aliases_ai` AFTER INSERT ON `topic_aliases` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('topic', NEW.`topic_id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_topic_aliases_au` AFTER UPDATE ON `topic_aliases` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('topic', NEW.`topic_id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_topic_aliases_ad` AFTER DELETE ON `topic_aliases` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('topic', OLD.`topic_id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_doubts_ai` AFTER INSERT ON `doubts` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('doubt', NEW.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_doubts_au` AFTER UPDATE ON `doubts` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('doubt', NEW.`id`); END;
--> statement-breakpoint
CREATE TRIGGER `search_dirty_doubts_ad` AFTER DELETE ON `doubts` BEGIN INSERT OR REPLACE INTO `search_dirty` (`kind`, `entity_id`) VALUES ('doubt', OLD.`id`); END;
