import { cpSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { openWorkspace } from '../../src/data/workspace';
import { tempDataFolder } from '../apoyo/base';
import { readRows } from '../apoyo/base-cruda';
import { buildCutChild, type CutChild, runCut } from '../apoyo/corte';
import { sample } from '../apoyo/importar';

// CA-126 y CA-017 en la importación (Fase 15): cortar el proceso a la fuerza antes de cada sentencia
// de «Importar» (la copia «Antes de importar», los medios y la transacción), o recién terminada. Al
// volver a abrir, lo importado está entero o no está, la base está sana, ninguna copia quedó a medias
// y «Verificar datos» da 0 diferencias.

let child: CutChild | undefined;
let folder: ReturnType<typeof tempDataFolder>;
let base = '';
let subjectId = '';

const open = (dataDir: string) =>
  openWorkspace({ dataDir, clock: demoClock(), appVersion: '0.0.0-prueba' });

beforeAll(async () => {
  folder = tempDataFolder();
  child = await buildCutChild();
  base = join(folder.folder, 'base');
  const workspace = open(base);
  subjectId = workspace.subjects.create({ name: 'Historia argentina', makeActive: true }).id;
  workspace.close();
}, 120_000);

afterAll(() => {
  child?.remove();
  folder?.remove();
});

function copyOf(name: string): string {
  const target = join(folder.folder, name);
  cpSync(base, target, { recursive: true });
  return target;
}

async function afterReopening(dataDir: string) {
  const workspace = open(dataDir);
  try {
    return {
      integrity: workspace.integrityCheck(),
      differences: workspace.verifyData(),
      backups: await workspace.backups(),
      cards: workspace.cards.count(),
      notes: Number(readRows(join(dataDir, 'retenia.db'), 'SELECT COUNT(*) AS n FROM notes')[0]?.n),
      reviews: Number(
        readRows(
          join(dataDir, 'retenia.db'),
          "SELECT COUNT(*) AS n FROM observations WHERE source LIKE 'import:%'",
        )[0]?.n,
      ),
      leftovers: existsSync(join(dataDir, 'tmp')) ? readdirSync(join(dataDir, 'tmp')) : [],
    };
  } finally {
    workspace.close();
  }
}

async function cutAll(
  operation: string,
  data: Record<string, string>,
  accept: (state: Awaited<ReturnType<typeof afterReopening>>) => boolean,
  stride = 1,
) {
  const cutChild = child as CutChild;
  const probe = copyOf(`${operation}-sin-corte`);
  const whole = await runCut(cutChild, probe, operation, 0, data);
  expect(whole.done, whole.stderr).toBe(true);
  expect(whole.statements).toBeGreaterThan(0);
  const points = [
    ...Array.from({ length: whole.statements }, (_, index) => index + 1).filter(
      (point) => point === 1 || point === whole.statements || point % stride === 0,
    ),
    -1,
  ];
  const seen = new Set<string>();
  for (let start = 0; start < points.length; start += 4) {
    await Promise.all(
      points.slice(start, start + 4).map(async (cutAt) => {
        const dataDir = copyOf(`${operation}-${cutAt}`);
        const outcome = await runCut(cutChild, dataDir, operation, cutAt, data);
        expect(outcome.done, `corte ${cutAt}: el proceso tenía que morir`).toBe(false);
        const state = await afterReopening(dataDir);
        expect(state.integrity, `corte ${cutAt}`).toBe('ok');
        expect(state.differences, `corte ${cutAt}`).toEqual([]);
        expect(state.leftovers, `corte ${cutAt}`).toEqual([]);
        expect(
          state.backups.every((backup) => backup.readable),
          `corte ${cutAt}: ninguna copia a medias en la lista`,
        ).toBe(true);
        expect(accept(state), `corte ${cutAt}: ${JSON.stringify(state)}`).toBe(true);
        seen.add(state.cards === 0 && state.notes === 0 ? 'antes' : 'después');
      }),
    );
  }
  return seen;
}

describe('[CA-126] corte a la fuerza al importar', () => {
  it('[CA-126] Anki: antes de cada sentencia, o recién terminado, las 3 tarjetas con sus 5 repasos están enteras o no están', async () => {
    const seen = await cutAll(
      'importAnki',
      { file: sample('mazo-demo.apkg'), subjectId },
      (state) =>
        (state.cards === 0 && state.reviews === 0) || (state.cards === 3 && state.reviews === 5),
    );
    expect([...seen].sort()).toEqual(['antes', 'después']);
  }, 600_000);

  it('[CA-126] RemNote: las 12 notas con sus 8 tarjetas están enteras o no están', async () => {
    const seen = await cutAll(
      'importRemnote',
      { file: sample('remnote-demo.zip'), subjectId },
      (state) =>
        (state.cards === 0 && state.notes === 0) || (state.cards === 8 && state.notes === 12),
      7,
    );
    expect([...seen].sort()).toEqual(['antes', 'después']);
  }, 600_000);
});
