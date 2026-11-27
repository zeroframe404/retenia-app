import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { AiPrefs } from '../../ai/gate';
import { DEFAULT_CAP_CENTS } from '../../core/ai';

// Los ajustes de la IA (Fase 19): el tope del mes, «Modo solo local» y las funciones suspendidas.
// Viven en `ajustes.json` (como la apariencia), no en la base: restaurar una copia o cargar una
// exportación no los cambia, así un «Modo solo local» prendido nunca se apaga solo. Cada uno respeta
// lo de los demás en el archivo. Lo que no se entiende vuelve a lo de siempre: USD 10, apagado,
// todas habilitadas.

const DEFAULTS: AiPrefs = { capCents: DEFAULT_CAP_CENTS, localOnly: false, suspended: [] };

const stored = z.object({
  capCents: z.number().int().min(1).max(100_000).catch(DEFAULT_CAP_CENTS),
  localOnly: z.boolean().catch(false),
  suspended: z.array(z.string()).catch([]),
});

export interface AiPrefsStore {
  get(): AiPrefs;
  set(patch: Partial<AiPrefs>): AiPrefs;
}

function readSettings(file: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function createAiPrefsStore(dataDir: string): AiPrefsStore {
  const file = join(dataDir, 'ajustes.json');
  const get = (): AiPrefs => {
    const parsed = stored.safeParse(readSettings(file).ai);
    return parsed.success ? parsed.data : DEFAULTS;
  };
  return {
    get,
    set(patch) {
      const next = { ...get(), ...patch };
      mkdirSync(dataDir, { recursive: true });
      const temporary = `${file}.tmp`;
      writeFileSync(temporary, `${JSON.stringify({ ...readSettings(file), ai: next })}\n`);
      renameSync(temporary, file);
      return next;
    },
  };
}
