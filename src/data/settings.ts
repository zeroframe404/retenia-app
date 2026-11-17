import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Clock } from '../core/clock';
import type { Writer } from './orm';
import { settings } from './schema';

// Ajustes y preferencias guardados en la base (JSON por clave). Lo que no se puede leer (una clave
// que no está o un valor de otra forma) vale lo que diga `fallback`.

export function readSetting<T>(db: Writer, key: string, schema: z.ZodType<T>, fallback: T): T {
  const row = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  if (!row) {
    return fallback;
  }
  try {
    const parsed = schema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function writeSetting(db: Writer, clock: Clock, key: string, value: unknown): void {
  const values = { key, value: JSON.stringify(value), updatedAt: clock.now().toISOString() };
  db.insert(settings)
    .values(values)
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: values.value, updatedAt: values.updatedAt },
    })
    .run();
}
