import { z } from 'zod';

// Canal de prueba del puente. Además de responder, trae la variante y el día de estudio,
// para que la cinta de demostración compruebe de punta a punta que el puente anda.
export const pingRequest = z.strictObject({ message: z.literal('ping') });

export const pingResponse = z.strictObject({
  message: z.literal('pong'),
  variant: z.enum(['prueba', 'real']),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
