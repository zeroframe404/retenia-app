import { cpSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { openWorkspace } from '../../src/data/workspace';
import { createMaterialsService } from '../../src/main/materials/service';
import { runMaterialsTask } from '../../src/main/workers/materials-tasks';
import { tempDataFolder } from '../apoyo/base';
import { readRows } from '../apoyo/base-cruda';
import { buildCutChild, type CutChild, runCut } from '../apoyo/corte';
import { sample } from '../apoyo/materiales';

// CA-105 y CA-017 en los materiales (Fase 13): cortar el proceso a la fuerza antes de cada
// sentencia de «agregar material» y de «terminar la indexación», o recién terminadas. Al volver a
// abrir, el material está entero o no está, su original está entero o no está, y la cola sigue
// sola hasta «Listo».

let child: CutChild | undefined;
let folder: ReturnType<typeof tempDataFolder>;
const bases = { empty: '', beforeIndex: '' };
let subjectId = '';
const APUNTE = 'Apunte 3.pdf';

const open = (dataDir: string) =>
  openWorkspace({ dataDir, clock: demoClock(), appVersion: '0.0.0-prueba' });

const service = (workspace: ReturnType<typeof open>, autoStart = true) =>
  createMaterialsService({
    workspace,
    clock: demoClock(),
    execute: (task) => runMaterialsTask(task),
    autoStart,
    runnerId: 'despues-del-corte',
  });

beforeAll(async () => {
  folder = tempDataFolder();
  child = await buildCutChild();
  bases.empty = join(folder.folder, 'vacia');
  const empty = open(bases.empty);
  subjectId = empty.subjects.create({ name: 'Estadística básica', makeActive: true }).id;
  empty.close();

  // Un material que ya pasó por todas las etapas salvo la indexación.
  bases.beforeIndex = join(folder.folder, 'antes-de-indexar');
  cpSync(bases.empty, bases.beforeIndex, { recursive: true });
  const workspace = open(bases.beforeIndex);
  const materials = service(workspace, false);
  await materials.addFiles({ paths: [sample(APUNTE)], subjectId });
  while (materials.nextTask()?.stage !== 'index') {
    await materials.step();
  }
  workspace.close();
});

afterAll(() => {
  child?.remove();
  folder?.remove();
});

function copyOf(base: string, name: string): string {
  const target = join(folder.folder, name);
  cpSync(base, target, { recursive: true });
  return target;
}

async function afterReopening(dataDir: string) {
  const workspace = open(dataDir);
  const materials = service(workspace);
  await materials.whenIdle();
  const list = materials.list({ subjectId }).materials;
  const differences = workspace.verifyData();
  workspace.close();
  const originals = existsSync(join(dataDir, 'originales'))
    ? readdirSync(join(dataDir, 'originales'))
    : [];
  return { list, differences, originals };
}

async function cutPoints(base: string, operation: string, data: Record<string, string>) {
  if (!child) {
    throw new Error('falta el programa del corte');
  }
  const probe = copyOf(base, `${operation}-sin-corte`);
  const { statements } = await runCut(child, probe, operation, 0, data);
  expect(statements).toBeGreaterThan(0);
  return statements;
}

describe('[CA-105] corte a la fuerza al agregar un material', () => {
  it('[CA-105] antes de cada sentencia, o recién terminado: el material entero o ausente, y sigue solo hasta «Listo»', async () => {
    const data = { file: sample(APUNTE), subjectId };
    const statements = await cutPoints(bases.empty, 'materialAdd', data);
    for (const cutAt of [...Array.from({ length: statements }, (_, n) => n + 1), -1]) {
      const dataDir = copyOf(bases.empty, `agregar-${cutAt}`);
      await runCut(child as CutChild, dataDir, 'materialAdd', cutAt, data);
      const { list, differences, originals } = await afterReopening(dataDir);
      expect(differences, `corte ${cutAt}`).toEqual([]);
      expect(list.length, `corte ${cutAt}`).toBeLessThanOrEqual(1);
      if (list.length === 1) {
        expect(list[0]?.state, `corte ${cutAt}`).toEqual({ kind: 'ready' });
      }
      // Ningún original a medias: solo el archivo con su huella, o nada.
      expect(
        originals.every((name) => /^[0-9a-f]{64}\.pdf$/.test(name)),
        `corte ${cutAt}`,
      ).toBe(true);
      expect(readdirSync(join(dataDir, 'tmp')), `corte ${cutAt}`).toEqual([]);
    }
  });
});

describe('[CA-105] corte a la fuerza al terminar la indexación', () => {
  it('[CA-105] antes de cada sentencia, o recién terminada: la indexación entera o ausente, y al volver queda «Listo»', async () => {
    const statements = await cutPoints(bases.beforeIndex, 'materialIndex', {});
    for (const cutAt of [...Array.from({ length: statements }, (_, n) => n + 1), -1]) {
      const dataDir = copyOf(bases.beforeIndex, `indexar-${cutAt}`);
      await runCut(child as CutChild, dataDir, 'materialIndex', cutAt, {});
      const { list, differences } = await afterReopening(dataDir);
      expect(differences, `corte ${cutAt}`).toEqual([]);
      expect(
        list.map((material) => material.state),
        `corte ${cutAt}`,
      ).toEqual([{ kind: 'ready' }]);
      const blocks = readRows(
        join(dataDir, 'retenia.db'),
        'SELECT COUNT(*) AS n FROM material_blocks',
      )[0]?.n;
      expect(Number(blocks), `corte ${cutAt}`).toBeGreaterThan(0);
    }
  });
});
