import type { z } from 'zod';

// La respuesta de la IA se valida entera (Fase 19, CA-173): si no es JSON o no cumple su esquema al
// pie de la letra (un campo de más, uno que falta, un tipo cambiado, cortada), se descarta entera.
// Nunca se usa a medias.

export type ParsedOutput<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: 'not_json' | 'schema' };

export function parseModelOutput<T>(text: string | null, schema: z.ZodType<T>): ParsedOutput<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(text ?? '');
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: 'schema' };
}
