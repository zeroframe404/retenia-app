import { describe, expect, it } from 'vitest';
import { eventSchema } from '../../src/preload/contract/events';

// El aviso de un error inesperado del proceso principal (docs/decisiones.md, 27/11/2026): a la
// ventana le llega solo que pasó. Nada del error viaja por el puente: ni el mensaje ni la pila, que
// quedan en el registro de la carpeta de datos.

describe('aviso de un error inesperado', () => {
  it('llega validado y sin texto: solo su tipo', () => {
    expect(eventSchema.safeParse({ type: 'app.unexpectedError' }).success).toBe(true);
    expect(
      eventSchema.safeParse({ type: 'app.unexpectedError', message: 'Error: se rompió' }).success,
    ).toBe(false);
    expect(
      eventSchema.safeParse({ type: 'app.unexpectedError', stack: ['at f (archivo.js:1:1)'] })
        .success,
    ).toBe(false);
  });
});
