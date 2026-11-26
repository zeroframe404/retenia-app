import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AI_MODELS } from '../../src/ai/models';
import { PRICES } from '../../src/ai/prices';
import { EXPLAIN_PROMPT } from '../../src/ai/prompts/explicar-fragmento';

// La compuerta de IA mirada por dentro (Fase 19): el modelo fijado es el de docs/versiones.md, la
// tabla de precios tiene fecha, cada versión de un prompt tiene su huella (cambiar el texto obliga a
// subir la versión), nada de la IA se anota en la consola, y la compuerta no tiene cómo escribir
// fuera de sus tablas.

const ROOT = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function filesUnder(folder: string): string[] {
  return readdirSync(join(ROOT, folder)).flatMap((name) => {
    const path = join(folder, name);
    return statSync(join(ROOT, path)).isDirectory() ? filesUnder(path) : [path];
  });
}

describe('la compuerta de IA, por dentro', () => {
  it('cada modelo que usa Retenia es uno de los fijados en docs/versiones.md', () => {
    const versions = read('docs/versiones.md');
    for (const { model } of Object.values(AI_MODELS)) {
      expect(versions).toMatch(new RegExp(`^\\| ${model} \\| identificador vigente \\|`, 'm'));
    }
  });

  it('[CA-169] la tabla de precios tiene su fecha y el precio de cada modelo que se usa', () => {
    expect(PRICES.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PRICES.version).toMatch(/^\d{4}-\d{2}-\d{2}/);
    for (const { model } of Object.values(AI_MODELS)) {
      const price = PRICES.models[model];
      expect(price, model).toBeDefined();
      expect(price?.inputPerMTok).toBeGreaterThan(0);
      expect(price?.outputPerMTok).toBeGreaterThan(0);
    }
  });

  it('cada versión de un prompt tiene su huella: cambiar el texto sin subir la versión pone esto en rojo', () => {
    const locks = JSON.parse(read('src/ai/prompts/versiones.json')) as Record<
      string,
      Record<string, string>
    >;
    const hash = createHash('sha256').update(EXPLAIN_PROMPT.system).digest('hex');
    expect(locks[EXPLAIN_PROMPT.id]?.[String(EXPLAIN_PROMPT.version)]).toBe(hash);
  });

  it('nada de la IA se escribe en la consola: ni pedidos, ni respuestas, ni la clave', () => {
    for (const file of [...filesUnder('src/ai'), ...filesUnder('src/main/ai')]) {
      if (/\.tsx?$/.test(file)) {
        expect(read(file), file).not.toMatch(/\bconsole\./);
      }
    }
  });

  it('[CA-174] la compuerta del principal solo usa, de los datos, el almacén de la IA', () => {
    for (const file of filesUnder('src/main/ai')) {
      for (const [, target] of read(file).matchAll(/from '([^']+)'/g)) {
        if (target?.includes('/data/')) {
          expect(target, relative(ROOT, file)).toMatch(/\/data\/ai$/);
        }
      }
    }
  });

  it('[CA-174] el almacén de la IA solo escribe en las tablas de la IA', () => {
    const store = read('src/data/ai.ts');
    const writes = [...store.matchAll(/\.(insert|update|delete)\((\w+)\)/g)].map(
      (match) => match[2],
    );
    expect(writes.length).toBeGreaterThan(0);
    for (const table of writes) {
      expect(table).toMatch(/^ai[A-Z]/);
    }
    expect(store).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b(?![^`]*\bai_)/);
  });

  it('[CA-174] los canales de la IA solo llaman a la compuerta', () => {
    const bridge = read('src/main/bridge.ts');
    const handlers = [...bridge.matchAll(/^\s+'ai\.\w+': (.+)$/gm)].map((match) => match[1] ?? '');
    expect(handlers.length).toBe(12);
    for (const handler of handlers) {
      expect(handler).toMatch(/^async \(?\w*\)? => ai\.\w+\(\w*\),?$/);
    }
  });

  it('el SDK se arma siempre con la puerta única a internet y sin reintentos propios', () => {
    const adapter = read('src/ai/providers/anthropic.ts');
    const builds = [...adapter.matchAll(/new Anthropic\(\{([^}]*)\}\)/g)];
    expect(builds).toHaveLength(1);
    expect(builds[0]?.[1]).toMatch(/\bfetch\b/);
    expect(builds[0]?.[1]).toMatch(/maxRetries: 0/);
  });
});
