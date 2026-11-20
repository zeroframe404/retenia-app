import { z } from 'zod';

// Los avisos del principal a la ventana (docs/arquitectura.md, «events»). Por ahora, los de los
// materiales: avanzó, terminó, falló. No llevan contenido: la ventana vuelve a pedir lo que
// necesita. Un aviso que no cumple el esquema se descarta.

export const EVENTS_CHANNEL = 'retenia:avisos';

export const materialEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('material.progress'), materialId: z.uuid() }),
  z.strictObject({ type: z.literal('material.done'), materialId: z.uuid() }),
  z.strictObject({ type: z.literal('material.failed'), materialId: z.uuid() }),
]);
export type MaterialEvent = z.output<typeof materialEventSchema>;
