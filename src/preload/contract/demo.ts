import { z } from 'zod';

// Canales que solo existen en «Retenia (prueba)». Van dentro de una función para que, al
// compilar la versión real, nada de esto llegue al paquete: quien la llama lo hace detrás de
// `__VARIANTE__ === 'prueba'` y el empaquetador descarta la rama (docs/arquitectura.md, sección 6).
// Ajustes › «Demostración»: «+1 día», «+7 días», «+35 días» y «Restablecer fecha».
export function demoChannels() {
  const today = z.strictObject({ today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
  // Con qué datos está abierta la demostración: el elenco de ejemplo o una base vacía, como la
  // primera vez que se abre Retenia.
  const mode = z.strictObject({ mode: z.enum(['cast', 'first-time']) });
  const noRequest = z.strictObject({});
  return {
    'demo.state': { request: z.strictObject({}), response: today },
    'demo.advanceDays': {
      request: z.strictObject({ days: z.union([z.literal(1), z.literal(7), z.literal(35)]) }),
      response: today,
    },
    'demo.resetDate': { request: z.strictObject({}), response: today },
    // «Empezar como la primera vez» y «Volver al elenco» (Fase 07).
    'demo.dataMode': { request: noRequest, response: mode },
    'demo.useFirstTime': { request: noRequest, response: mode },
    'demo.useCast': { request: noRequest, response: mode },
  };
}
