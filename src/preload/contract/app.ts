import { z } from 'zod';

export const appInfoRequest = z.strictObject({});

export const appInfoResponse = z.strictObject({
  version: z.string(),
  variant: z.enum(['prueba', 'real']),
  dataDir: z.string(),
});
