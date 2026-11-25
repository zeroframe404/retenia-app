-- Disparadores de los objetivos (Fase 17, docs/modelo-de-datos.md, regla 3): un objetivo no se modifica.
-- Solo podría cambiar su `deleted_at` (todavía no se borran). Lo demás de un objetivo (sus actividades, sus requisitos, «Ya lo sé»,
-- «No quiero esto ahora») son eventos del libro mayor.
-- Cada cuerpo va en una sola línea (la prueba de migraciones corta en punto y coma con salto).
CREATE TRIGGER `objectives_no_update` BEFORE UPDATE OF `id`, `subject_id`, `topic_id`, `title`, `action`, `content`, `conditions`, `kind`, `concept_key`, `source`, `created_at` ON `objectives` BEGIN SELECT RAISE(ABORT, 'un objetivo no se modifica: lo que cambia se anota en el historial'); END;
