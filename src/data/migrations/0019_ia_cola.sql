-- La cola de la IA (Fase 19) recuerda con qué IA y con qué permiso se pidió cada pedido: antes de salir se
-- vuelve a mirar, y si ya no puede salir (cambió la IA, se quitó el permiso) se cancela.
ALTER TABLE `ai_queue` ADD `provider` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_queue` ADD `allowed_by` text DEFAULT 'once' NOT NULL;