import { z } from 'zod';

// Los avisos del principal a la ventana (docs/arquitectura.md, «events»): los de los materiales
// (avanzó, terminó, falló) y, desde la Fase 19, los de la IA (un pedido quedó pendiente, llegó su
// resultado). No llevan contenido: la ventana vuelve a pedir lo que necesita. Un aviso que no
// cumple el esquema se descarta.

export const EVENTS_CHANNEL = 'retenia:avisos';

export const materialEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('material.progress'), materialId: z.uuid() }),
  z.strictObject({ type: z.literal('material.done'), materialId: z.uuid() }),
  z.strictObject({ type: z.literal('material.failed'), materialId: z.uuid() }),
]);
export type MaterialEvent = z.output<typeof materialEventSchema>;

export const aiEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ai.pending'), requestId: z.uuid() }),
  z.strictObject({ type: z.literal('ai.result'), requestId: z.uuid() }),
]);
export type AiEvent = z.output<typeof aiEventSchema>;

export const eventSchema = z.union([materialEventSchema, aiEventSchema]);
export type ReteniaEvent = z.output<typeof eventSchema>;
