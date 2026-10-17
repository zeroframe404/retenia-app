import { z } from 'zod';

// Canales que solo existen en «Retenia (prueba)». Van dentro de una función para que, al
// compilar la versión real, nada de esto llegue al paquete: quien la llama lo hace detrás de
// `__VARIANTE__ === 'prueba'` y el empaquetador descarta la rama (docs/arquitectura.md, sección 6).
// Ajustes › «Demostración»: «+1 día», «+7 días», «+35 días» y «Restablecer fecha».
export function demoChannels() {
  const today = z.strictObject({ today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
  return {
    'demo.state': { request: z.strictObject({}), response: today },
    'demo.advanceDays': {
      request: z.strictObject({ days: z.union([z.literal(1), z.literal(7), z.literal(35)]) }),
      response: today,
    },
    'demo.resetDate': { request: z.strictObject({}), response: today },
  };
}
