-- Disparadores del libro mayor (docs/modelo-de-datos.md, regla 1): el historial solo se agrega.
-- Cada cuerpo va en una sola línea (la prueba de migraciones corta en punto y coma con salto).
CREATE TRIGGER `observations_no_update` BEFORE UPDATE ON `observations` BEGIN SELECT RAISE(ABORT, 'el historial solo se agrega: una observación no se modifica'); END;
--> statement-breakpoint
CREATE TRIGGER `observations_no_delete` BEFORE DELETE ON `observations` BEGIN SELECT RAISE(ABORT, 'el historial solo se agrega: una observación no se borra'); END;
--> statement-breakpoint
CREATE TRIGGER `evaluations_no_update` BEFORE UPDATE ON `evaluations` BEGIN SELECT RAISE(ABORT, 'el historial solo se agrega: una evaluación se enmienda agregando otra'); END;
--> statement-breakpoint
CREATE TRIGGER `evaluations_no_delete` BEFORE DELETE ON `evaluations` BEGIN SELECT RAISE(ABORT, 'el historial solo se agrega: una evaluación no se borra'); END;
--> statement-breakpoint
CREATE TRIGGER `evaluations_chain` BEFORE INSERT ON `evaluations` WHEN (NEW.`version` = 1 AND NEW.`supersedes_id` IS NOT NULL) OR (NEW.`version` <> 1 AND NOT EXISTS (SELECT 1 FROM `evaluations` WHERE `id` = NEW.`supersedes_id` AND `attempt_id` = NEW.`attempt_id` AND `version` = NEW.`version` - 1)) BEGIN SELECT RAISE(ABORT, 'evaluación fuera de orden: la nueva enmienda a la vigente del mismo intento'); END;
--> statement-breakpoint
CREATE TRIGGER `operations_no_update` BEFORE UPDATE ON `operations` BEGIN SELECT RAISE(ABORT, 'el historial solo se agrega: una operación no se modifica'); END;
--> statement-breakpoint
CREATE TRIGGER `operations_no_delete` BEFORE DELETE ON `operations` BEGIN SELECT RAISE(ABORT, 'el historial solo se agrega: una operación no se borra'); END;
--> statement-breakpoint
CREATE TRIGGER `card_versions_no_update` BEFORE UPDATE ON `card_versions` BEGIN SELECT RAISE(ABORT, 'las versiones no se modifican: editar agrega una versión nueva'); END;
--> statement-breakpoint
CREATE TRIGGER `card_versions_no_delete` BEFORE DELETE ON `card_versions` WHEN NOT EXISTS (SELECT 1 FROM `purge_permits` WHERE `entity_type` = 'card' AND `entity_id` = OLD.`card_id`) BEGIN SELECT RAISE(ABORT, 'las versiones no se borran salvo al vaciar la papelera'); END;
