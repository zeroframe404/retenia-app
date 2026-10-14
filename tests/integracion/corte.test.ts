import { randomUUID } from 'node:crypto';
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { createCardsStore } from '../../src/data/cards';
import { openDatabase } from '../../src/data/database';
import { verifyData } from '../../src/data/projections';
import { tempDataFolder } from '../apoyo/base';
import { readRows } from '../apoyo/base-cruda';
import { buildCutChild, type CutChild, runCut } from '../apoyo/corte';

// CA-017: un cierre a la fuerza nunca deja una escritura a medias. Un proceso aparte hace una
// escritura real de Retenia y se mata (como un corte de luz o un cierre forzado) justo antes de
// cada una de sus sentencias, y también recién confirmada. Al abrir de nuevo, la base está sana,
// la escritura está entera o no está, y «Verificar datos» da 0 diferencias.

let child: CutChild | undefined;
let folder: ReturnType<typeof tempDataFolder>;
const ids = { reviewed: '', fresh: '' };

beforeAll(async () => {
  folder = tempDataFolder();
  child = await buildCutChild();
  const db = openDatabase(folder.file);
  const store = createCardsStore(db, demoClock());
  const reviewed = store.create({
    question: '¿Qué mide el desvío estándar?',
    answer: 'Cuánto se alejan, en promedio, los datos de la media.',
  });
  const fresh = store.create({ question: '¿Qué es la varianza?', answer: 'El promedio...' });
  store.review({ cardId: reviewed.id, grade: 'good', attemptId: randomUUID() });
  db.close();
  ids.reviewed = reviewed.id;
  ids.fresh = fresh.id;
}, 60_000);

afterAll(() => {
  child?.remove();
  folder?.remove();
});

// Lo que dice la base, sin identificadores (cambian de una corrida a otra).
function fingerprint(file: string) {
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
  const target = join(folder.folder, `copia-${copies}.db`);
  copyFileSync(folder.file, target);
  return target;
}

// Abrir de nuevo como lo hace Retenia (recupera lo que haya quedado en el diario de escritura),
// comprobar la base y verificar los datos.
function reopen(file: string) {
  const db = openDatabase(file);
  try {
    return { integrity: db.integrityCheck(), differences: verifyData(db) };
  } finally {
    db.close();
  }
}

async function cutEverywhere(operation: string, data: Record<string, string>): Promise<number> {
  if (!child) {
    throw new Error('El programa hijo no se armó');
  }
  const cutChild = child;
  const before = fingerprint(folder.file);
  const wholeFile = copyOfBase();
  const whole = await runCut(cutChild, wholeFile, operation, 0, data);
  expect(whole.done, whole.stderr).toBe(true);
  const after = fingerprint(wholeFile);
  expect(after, 'la escritura completa tiene que cambiar algo').not.toEqual(before);

  // Antes de cada sentencia (la última es la confirmación) y recién confirmada (-1).
  const points = [...Array.from({ length: whole.statements }, (_, index) => index + 1), -1];
  for (let start = 0; start < points.length; start += 4) {
    await Promise.all(
      points.slice(start, start + 4).map(async (cutAt) => {
        const file = copyOfBase();
        const outcome = await runCut(cutChild, file, operation, cutAt, data);
        expect(outcome.done, `corte ${cutAt}: el proceso tenía que morir`).toBe(false);
        const { integrity, differences } = reopen(file);
        expect(integrity, `corte ${cutAt}`).toBe('ok');
        expect(differences, `corte ${cutAt}`).toEqual([]);
        expect(fingerprint(file), `corte ${cutAt}`).toEqual(cutAt === -1 ? after : before);
      }),
    );
  }
  return whole.statements;
}

describe('corte del proceso en cada punto de una escritura', () => {
  it('[CA-017] cortar el proceso antes de cada sentencia de un repaso, o recién confirmado, deja el repaso entero o ausente y «Verificar datos» en 0', async () => {
    const statements = await cutEverywhere('review', {
      cardId: ids.fresh,
      attemptId: randomUUID(),
    });
    // Empezar, observación, evaluación, agenda y confirmar: varios puntos de corte de verdad.
    expect(statements).toBeGreaterThanOrEqual(6);
  }, 120_000);

  it('[CA-017] cortar el proceso en cada punto de un segundo repaso de la misma tarjeta tampoco deja nada a medias', async () => {
    await cutEverywhere('review', { cardId: ids.reviewed, attemptId: randomUUID(), days: '7' });
  }, 120_000);

  it('[CA-017] cortar el proceso en cada punto del alta de una tarjeta deja la tarjeta entera (con su agenda y su operación) o ninguna', async () => {
    await cutEverywhere('create', { question: '¿Capital de Francia?', answer: 'París' });
  }, 120_000);

  it('[CA-017] cortar el proceso en cada punto de una edición deja la versión nueva entera o la anterior', async () => {
    await cutEverywhere('edit', {
      cardId: ids.fresh,
      question: '¿Qué es la varianza? PRUEBA',
      answer: 'El promedio...',
    });
  }, 120_000);
});
