import { z } from 'zod';

// El esquema de salida que se le pide a la IA (Fase 19), sacado del mismo esquema Zod que valida la
// respuesta. La API no acepta topes (mínimos, máximos, largos) ni la marca de versión del esquema:
// se sacan acá y los controla Zod en la PC, con la respuesta entera. Los objetos quedan sin campos
// de más (`additionalProperties: false`).

const UNSUPPORTED = new Set([
  '$schema',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'pattern',
  'format',
]);

function strip(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(strip);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (!UNSUPPORTED.has(key)) {
      out[key] = strip(inner);
    }
  }
  if (out.type === 'object') {
    out.additionalProperties = false;
  }
  return out;
}

export function toApiSchema(schema: z.ZodType): Record<string, unknown> {
  return strip(z.toJSONSchema(schema, { io: 'output' })) as Record<string, unknown>;
}
