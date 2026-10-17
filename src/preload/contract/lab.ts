import { z } from 'zod';

// Canales del Laboratorio (H-07), solo de «Retenia (prueba)». Van dentro de una función por lo
// mismo que los de demo.ts: la versión real no los lleva. Además, «Simular sin conexión» de
// Ajustes › «Demostración».

// La grabación viaja como muestras de 16 kHz, de 30 segundos como mucho.
const MAX_SAMPLES = 16_000 * 30;

export function labChannels() {
  const none = z.strictObject({});
  const ms = z.number().nonnegative();
  const failure = z.strictObject({ ok: z.literal(false) });
  const voiceFailure = z.strictObject({
    ok: z.literal(false),
    problem: z.enum(['noModels', 'failed']),
  });
  const modelsStatus = z.strictObject({
    state: z.enum(['missing', 'downloading', 'ready', 'failed']),
    doneBytes: z.number().nonnegative(),
    totalBytes: z.number().positive(),
    problem: z.enum(['offline', 'corrupt', 'server', 'disk']).optional(),
  });
  const connection = z.strictObject({ offline: z.boolean() });
  const rect = z.strictObject({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  });
  return {
    'demo.connection': { request: none, response: connection },
    'demo.setConnection': { request: connection, response: connection },
    'demo.lab.modelsStatus': { request: none, response: modelsStatus },
    'demo.lab.downloadModels': { request: none, response: modelsStatus },
    'demo.lab.speak': {
      request: z.strictObject({
        text: z.string().trim().min(1).max(500),
        voice: z.number().int().min(0).max(3),
      }),
      response: z.union([
        z.strictObject({ ok: z.literal(true), audio: z.instanceof(Uint8Array), ms }),
        voiceFailure,
      ]),
    },
    'demo.lab.microphone': {
      request: none,
      response: z.strictObject({ access: z.enum(['granted', 'denied']) }),
    },
    'demo.lab.openMicrophoneSettings': { request: none, response: none },
    'demo.lab.transcribe': {
      request: z.strictObject({
        samples: z
          .instanceof(Float32Array)
          .refine((samples) => samples.length <= MAX_SAMPLES, 'Grabación demasiado larga'),
        sampleRate: z.literal(16000),
      }),
      response: z.union([
        z.strictObject({ ok: z.literal(true), text: z.string().max(5000), ms }),
        voiceFailure,
      ]),
    },
    'demo.lab.readPdf': {
      request: none,
      response: z.union([
        z.strictObject({
          ok: z.literal(true),
          ms,
          text: z.string(),
          width: z.number().positive(),
          height: z.number().positive(),
          phrase: z.string(),
          highlight: z.array(rect),
          pdf: z.instanceof(Uint8Array),
        }),
        failure,
      ]),
    },
    'demo.lab.ocrPage': {
      request: none,
      response: z.union([z.strictObject({ ok: z.literal(true), ms, text: z.string() }), failure]),
    },
    'demo.lab.notify': {
      request: none,
      response: z.union([z.strictObject({ ok: z.literal(true), ms }), failure]),
    },
  };
}
