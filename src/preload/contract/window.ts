import { z } from 'zod';

// El zoom de la ventana con el teclado (Ctrl y +, Ctrl y - y Ctrl y 0). Retenia no tiene menú, así
// que la ventana atrapa las teclas y le pide al principal el paso: este calcula el zoom que sigue y
// se lo pone a la ventana (CA-035).
export const zoomRequest = z.strictObject({ direction: z.enum(['in', 'out', 'reset']) });
export const zoomResponse = z.strictObject({ factor: z.number().positive() });

// Al cerrar la ventana, el principal le pide a la pantalla que guarde lo que tenga a medio escribir
// y espera este aviso antes de cerrar (CA-043: cerrar el programa nunca pierde lo escrito).
export const flushedRequest = z.strictObject({});
export const flushedResponse = z.strictObject({});
