import { z } from 'zod';

// Los avisos del principal a la ventana (docs/arquitectura.md, «events»): los de los materiales
// (avanzó, terminó, falló), desde la Fase 19 los de la IA (un pedido quedó pendiente, llegó su
// resultado) y, desde el 27/11/2026, el de un error inesperado del proceso principal. No llevan
// contenido: la ventana vuelve a pedir lo que necesita, y el detalle de un error queda en el
// registro de la carpeta de datos. Un aviso que no cumple el esquema se descarta.

export const EVENTS_CHANNEL = 'retenia:avisos';

export const materialEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('material.progress'), materialId: z.uuid() }),
  z.strictObject({ type: z.literal('material.done'), materialId: z.uuid() }),
  z.strictObject({ type: z.literal('material.failed'), materialId: z.uuid() }),
]);
export type MaterialEvent = z.output<typeof materialEventSchema>;

const aiEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ai.pending'), requestId: z.uuid() }),
  z.strictObject({ type: z.literal('ai.result'), requestId: z.uuid() }),
]);
export type AiEvent = z.output<typeof aiEventSchema>;

const appEventSchema = z.strictObject({ type: z.literal('app.unexpectedError') });

export const eventSchema = z.union([materialEventSchema, aiEventSchema, appEventSchema]);
export type ReteniaEvent = z.output<typeof eventSchema>;
