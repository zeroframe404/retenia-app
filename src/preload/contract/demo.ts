import { z } from 'zod';

// Canales que solo existen en «Retenia (prueba)». Van dentro de una función para que, al
// compilar la versión real, nada de esto llegue al paquete: quien la llama lo hace detrás de
// `__VARIANTE__ === 'prueba'` y el empaquetador descarta la rama (docs/arquitectura.md, sección 6).
export function demoChannels() {
  return {
    'demo.state': {
      request: z.strictObject({}),
      response: z.strictObject({ today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    },
  };
}
