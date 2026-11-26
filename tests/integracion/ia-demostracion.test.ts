import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildExplainRequest, EXPLAIN_FRAGMENT } from '../../src/ai/functions/explain-fragment';
import { createDemoAi, demoAiOrigin } from '../../src/main/demo/ai';

// La IA simulada de «Retenia (prueba)» (Fase 19): la demora de «IA simulada: tardar 12 segundos»
// (con la espera simulada: nada espera de verdad) y la dirección del servidor de la IA en la PC,
// que solo vale en 127.0.0.1.

const folders: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

const request = () => {
  const built = buildExplainRequest({
    fragment: 'Una muestra es una parte de la población.',
    materialTitle: 'Apunte',
  });
  return {
    model: EXPLAIN_FRAGMENT.model,
    system: built.system,
    user: built.user,
    schema: {},
    maxTokens: EXPLAIN_FRAGMENT.maxTokens,
    effort: EXPLAIN_FRAGMENT.effort,
  };
};

describe('la IA simulada de la demostración', () => {
  it('«IA simulada: tardar 12 segundos» demora cada respuesta 12 segundos; apagado, no demora (simulado: la espera)', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'retenia-ia-demo-'));
    folders.push(dataDir);
    const waits: number[] = [];
    const demo = createDemoAi({
      dataDir,
      isOffline: () => false,
      sleep: async (ms: number) => {
        waits.push(ms);
      },
    });
    demo.set({ simulated: true, slow: true });
    await demo.provider()?.complete(request());
    expect(waits).toEqual([12_000]);
    demo.set({ slow: false });
    await demo.provider()?.complete(request());
    expect(waits).toEqual([12_000]);
  });

  it('el servidor de la IA en la PC (`RETENIA_IA_ORIGEN`) solo vale en http://127.0.0.1 con un puerto', () => {
    for (const [value, expected] of [
      ['http://127.0.0.1:4567', 'http://127.0.0.1:4567'],
      ['http://localhost:4567', undefined],
      ['https://127.0.0.1:4567', undefined],
      ['http://127.0.0.1.otro:4567', undefined],
      ['http://127.0.0.1:4567/v1', undefined],
      ['http://127.0.0.1', undefined],
      ['https://api.anthropic.com', undefined],
    ] as const) {
      vi.stubEnv('RETENIA_IA_ORIGEN', value);
      expect(demoAiOrigin(), value).toBe(expected);
    }
    vi.unstubAllEnvs();
    delete process.env.RETENIA_IA_ORIGEN;
    expect(demoAiOrigin()).toBeUndefined();
  });
});
