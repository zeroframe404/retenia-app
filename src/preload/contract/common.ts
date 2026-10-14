import { z } from 'zod';

// Formas que comparten varios canales.

// Un día (de estudio o de calendario) como AAAA-MM-DD.
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Una hora de Buenos Aires como HH:MM.
export const time = z.string().regex(/^\d{2}:\d{2}$/);

// Un pedido sin datos.
export const noRequest = z.strictObject({});
