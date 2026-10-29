-- Disparadores de los renglones de las notas (docs/modelo-de-datos.md, regla 3): una versión no se modifica.
-- Solo se borra al vaciar la papelera, con el permiso ('block', <renglón>) que vive dentro de esa transacción.
-- Cada cuerpo va en una sola línea (la prueba de migraciones corta en punto y coma con salto).
CREATE TRIGGER `block_versions_no_update` BEFORE UPDATE ON `block_versions` BEGIN SELECT RAISE(ABORT, 'las versiones no se modifican: editar agrega una versión nueva'); END;
--> statement-breakpoint
CREATE TRIGGER `block_versions_no_delete` BEFORE DELETE ON `block_versions` WHEN NOT EXISTS (SELECT 1 FROM `purge_permits` WHERE `entity_type` = 'block' AND `entity_id` = OLD.`block_id`) BEGIN SELECT RAISE(ABORT, 'las versiones no se borran salvo al vaciar la papelera'); END;
