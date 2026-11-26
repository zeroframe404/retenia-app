-- Disparadores de «Qué se envió» (Fase 19, docs/modelo-de-datos.md, regla 1): cada envío a la IA solo se agrega.
-- Nunca se modifica ni se borra: es el registro permanente de lo que salió de tu PC y de lo que costó.
-- Cada cuerpo va en una sola línea (la prueba de migraciones corta en punto y coma con salto).
CREATE TRIGGER `ai_requests_no_update` BEFORE UPDATE ON `ai_requests` BEGIN SELECT RAISE(ABORT, 'un envío a la IA no se modifica: «Qué se envió» solo se agrega'); END;
--> statement-breakpoint
CREATE TRIGGER `ai_requests_no_delete` BEFORE DELETE ON `ai_requests` BEGIN SELECT RAISE(ABORT, 'un envío a la IA no se borra: «Qué se envió» es permanente'); END;
