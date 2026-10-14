import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { openWorkspace } from '../../src/data/workspace';
import { tempDataFolder } from '../apoyo/base';
import { readRows } from '../apoyo/base-cruda';
import { buildCutChild, type CutChild, runCut } from '../apoyo/corte';

// CA-017: un cierre a la fuerza nunca deja nada a medias. Un proceso aparte hace una escritura
// real de Retenia y se mata (como un corte de luz o un cierre forzado) justo antes de cada una de
// sus sentencias, o entre los pasos con archivos de una copia o una restauración, y también
// recién terminada. Al abrir de nuevo, la base está sana, la escritura está entera o no está,
// no queda ninguna copia a medias en la lista y «Verificar datos» da 0 diferencias.

let child: CutChild | undefined;
let folder: ReturnType<typeof tempDataFolder>;
let base = '';
const ids = { reviewed: '', fresh: '', backup: '' };

beforeAll(async () => {
  folder = tempDataFolder();
  child = await buildCutChild();
  base = join(folder.folder, 'base');
  const workspace = openWorkspace({
    dataDir: base,
    clock: demoClock(),
    appVersion: '0.0.0-prueba',
  });
  const reviewed = workspace.cards.create({
    question: '¿Qué mide el desvío estándar?',
    answer: 'Cuánto se alejan, en promedio, los datos de la media.',
  });
  const fresh = workspace.cards.create({
    question: '¿Qué es la varianza?',
    answer: 'El promedio...',
  });
  workspace.cards.review({ cardId: reviewed.id, grade: 'good', attemptId: randomUUID() });
  // Una copia hecha a mano y, después de ella, un cambio más: restaurarla tiene que notarse.
  const backup = await workspace.createBackup('manual');
  workspace.cards.create({ question: 'Hecha después de la copia', answer: 'x' });
  workspace.close();
  ids.reviewed = reviewed.id;
  ids.fresh = fresh.id;
  ids.backup = backup.id ?? '';
}, 60_000);

afterAll(() => {
  child?.remove();
  folder?.remove();
});

// Lo que dice la base, sin identificadores (cambian de una corrida a otra).
function fingerprint(dataDir: string) {
  const file = join(dataDir, 'retenia.db');
  const count = (table: string) =>
    Number(readRows(file, `SELECT count(*) AS n FROM ${table}`)[0]?.n);
  return {
    observations: count('observations'),
    evaluations: count('evaluations'),
    operations: count('operations'),
    cards: count('cards'),
    versions: count('card_versions'),
    lastSeq: readRows(file, 'SELECT last_seq FROM ledger_state')[0]?.last_seq,
    schedule: readRows(
      file,
      'SELECT due_at, reps, lapses, state FROM card_schedule ORDER BY due_at, reps, state',
    ),
    questions: readRows(
      file,
      'SELECT v.question, c.deleted_at FROM cards c JOIN card_versions v ON v.id = c.current_version_id ORDER BY v.question',
    ),
  };
}

let copies = 0;
function copyOfBase(): string {
  copies += 1;
  const target = join(folder.folder, `copia-${copies}`);
  cpSync(base, target, { recursive: true });
  return target;
}

// Abrir de nuevo como lo hace Retenia (recupera lo que haya quedado en el diario de escritura y
// limpia los archivos de trabajo a medias), comprobar la base, las copias y verificar los datos.
async function reopen(dataDir: string) {
  const workspace = openWorkspace({ dataDir, clock: demoClock(), appVersion: '0.0.0-prueba' });
  try {
    return {
      integrity: workspace.integrityCheck(),
      differences: workspace.verifyData(),
      backups: await workspace.backups(),
      leftovers: [
        ...readdirSync(join(dataDir, 'tmp')),
        ...(existsSync(join(dataDir, 'copias'))
          ? readdirSync(join(dataDir, 'copias')).filter((name) => name.endsWith('.tmp'))
          : []),
      ],
    };
  } finally {
    workspace.close();
  }
}

async function cutEverywhere(operation: string, data: Record<string, string>) {
  if (!child) {
    throw new Error('El programa hijo no se armó');
  }
  const cutChild = child;
  const before = fingerprint(base);
  const wholeDir = copyOfBase();
  const whole = await runCut(cutChild, wholeDir, operation, 0, data);
  expect(whole.done, whole.stderr).toBe(true);
  const after = fingerprint(wholeDir);

  // Antes de cada punto y recién terminada (-1).
  const points = [...Array.from({ length: whole.statements }, (_, index) => index + 1), -1];
  const outcomes: { cutAt: number; state: 'antes' | 'después' }[] = [];
  for (let start = 0; start < points.length; start += 4) {
    await Promise.all(
      points.slice(start, start + 4).map(async (cutAt) => {
        const dataDir = copyOfBase();
        const outcome = await runCut(cutChild, dataDir, operation, cutAt, data);
        expect(outcome.done, `corte ${cutAt}: el proceso tenía que morir`).toBe(false);
        const reopened = await reopen(dataDir);
        expect(reopened.integrity, `corte ${cutAt}`).toBe('ok');
        expect(reopened.differences, `corte ${cutAt}`).toEqual([]);
        expect(reopened.leftovers, `corte ${cutAt}`).toEqual([]);
        expect(
          reopened.backups.every((backup) => backup.readable),
          `corte ${cutAt}: ninguna copia a medias en la lista`,
        ).toBe(true);
        const state = fingerprint(dataDir);
        expect([before, after], `corte ${cutAt}`).toContainEqual(state);
        outcomes.push({
          cutAt,
          state: JSON.stringify(state) === JSON.stringify(before) ? 'antes' : 'después',
        });
      }),
    );
  }
  return { points: whole.statements, before, after, outcomes };
}

describe('corte del proceso en cada punto de una escritura', () => {
  it('[CA-017] cortar el proceso antes de cada sentencia de un repaso, o recién confirmado, deja el repaso entero o ausente y «Verificar datos» en 0', async () => {
    const { points, outcomes } = await cutEverywhere('review', {
      cardId: ids.fresh,
      attemptId: randomUUID(),
    });
    // Empezar, observación, evaluación, agenda y confirmar: varios puntos de corte de verdad.
    expect(points).toBeGreaterThanOrEqual(6);
    // Hasta la confirmación (incluida, porque se corta antes de ejecutarla) no hay nada; después, todo.
    for (const { cutAt, state } of outcomes) {
      expect(state, `corte ${cutAt}`).toBe(cutAt === -1 ? 'después' : 'antes');
    }
  }, 120_000);

  it('[CA-017] cortar el proceso en cada punto de un segundo repaso de la misma tarjeta tampoco deja nada a medias', async () => {
    const { outcomes } = await cutEverywhere('review', {
      cardId: ids.reviewed,
      attemptId: randomUUID(),
      days: '7',
    });
    for (const { cutAt, state } of outcomes) {
      expect(state, `corte ${cutAt}`).toBe(cutAt === -1 ? 'después' : 'antes');
    }
  }, 120_000);

  it('[CA-017] cortar el proceso en cada punto del alta de una tarjeta deja la tarjeta entera (con su agenda y su operación) o ninguna', async () => {
    const { outcomes } = await cutEverywhere('create', {
      question: '¿Capital de Francia?',
      answer: 'París',
    });
    for (const { cutAt, state } of outcomes) {
      expect(state, `corte ${cutAt}`).toBe(cutAt === -1 ? 'después' : 'antes');
    }
  }, 120_000);

  it('[CA-017] cortar el proceso en cada punto de una edición deja la versión nueva entera o la anterior', async () => {
    const { outcomes } = await cutEverywhere('edit', {
      cardId: ids.fresh,
      question: '¿Qué es la varianza? PRUEBA',
      answer: 'El promedio...',
    });
    for (const { cutAt, state } of outcomes) {
      expect(state, `corte ${cutAt}`).toBe(cutAt === -1 ? 'después' : 'antes');
    }
  }, 120_000);

  it('[CA-017] cortar el proceso entre los pasos de «Hacer copia ahora» no toca la base ni deja una copia a medias en la lista', async () => {
    const { points, before, after } = await cutEverywhere('backup', { unit: 'paso' });
    expect(points).toBeGreaterThanOrEqual(4);
    // Hacer una copia no cambia los datos.
    expect(after).toEqual(before);
  }, 120_000);

  it('[CA-020] [CA-017] cortar el proceso entre los pasos de «Restaurar» deja la base como estaba o como la copia, nunca a medias', async () => {
    const { points, outcomes } = await cutEverywhere('restore', {
      unit: 'paso',
      backupId: ids.backup,
    });
    expect(points).toBeGreaterThanOrEqual(8);
    // Al principio queda como estaba; desde que el archivo se reemplaza, como la copia.
    const states = [...outcomes].sort((a, b) =>
      a.cutAt === -1 ? 1 : b.cutAt === -1 ? -1 : a.cutAt - b.cutAt,
    );
    expect(states[0]?.state).toBe('antes');
    expect(states.at(-1)?.state).toBe('después');
    const firstAfter = states.findIndex((outcome) => outcome.state === 'después');
    expect(states.slice(firstAfter).every((outcome) => outcome.state === 'después')).toBe(true);
  }, 120_000);
});
