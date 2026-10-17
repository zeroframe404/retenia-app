import { z } from 'zod';

// Los mensajes entre el proceso principal y los procesos de trabajo, validados de los dos lados
// con Zod (docs/arquitectura.md, sección 1). El principal manda { id, kind, … } y el proceso
// contesta { id, ok: true, result } o { id, ok: false, problem }.

const folder = z.string().min(1).max(1000);

export const voiceTask = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('speak'),
    modelsDir: folder,
    text: z.string().trim().min(1).max(500),
    voice: z.number().int().min(0).max(3),
  }),
  z.strictObject({
    kind: z.literal('transcribe'),
    modelsDir: folder,
    samples: z.instanceof(Float32Array),
    sampleRate: z.number().int().min(8000).max(48000),
  }),
]);

export const materialsTask = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('readPdfPage'),
    file: folder,
    page: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal('ocrPdfPage'),
    file: folder,
    page: z.number().int().positive(),
    workDir: folder,
  }),
]);

// Lo que puede salir mal en un proceso de trabajo, además de su respuesta.
const workerProblem = z.enum(['noModels', 'failed', 'timeout', 'crashed']);
export type WorkerProblemName = z.infer<typeof workerProblem>;

export const workerResponse = z.union([
  z.strictObject({ id: z.number().int(), ok: z.literal(true), result: z.unknown() }),
  z.strictObject({ id: z.number().int(), ok: z.literal(false), problem: workerProblem }),
]);

// Separa el número de pedido de la tarea.
export function splitRequest(raw: unknown): { id: number; task: unknown } {
  if (raw === null || typeof raw !== 'object' || !('id' in raw)) {
    return { id: -1, task: raw };
  }
  const { id, ...task } = raw as { id: unknown };
  return { id: typeof id === 'number' ? id : -1, task };
}
