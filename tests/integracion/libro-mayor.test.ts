import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { BUENOS_AIRES_ZONE, demoClock } from '../../src/core/clock';
import { createCardsStore } from '../../src/data/cards';
import { openDatabase } from '../../src/data/database';
import { tempDataFolder } from '../apoyo/base';
import { readRows } from '../apoyo/base-cruda';

// El libro mayor con la base real (docs/modelo-de-datos.md, sección 1): observaciones que no
// cambian, evaluaciones que se enmiendan agregando y operaciones para deshacer. La base misma
// rechaza modificar o borrar un evento.

const folders: ReturnType<typeof tempDataFolder>[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

// Una base con una tarjeta repasada una vez («La sabía») y editada, ya cerrada.
function withHistory() {
  const folder = tempDataFolder();
  folders.push(folder);
  const db = openDatabase(folder.file);
  const store = createCardsStore(db, demoClock());
  const card = store.create({ question: '¿Qué mide el desvío estándar?', answer: 'La dispersión' });
  store.review({ cardId: card.id, grade: 'good', attemptId: randomUUID() });
  store.edit({ cardId: card.id, question: '¿Qué mide el desvío?', answer: 'La dispersión' });
  db.close();
  return { file: folder.file, cardId: card.id };
}

function tryRaw(file: string, sql: string): string {
  const raw = new Database(file);
  try {
    raw.prepare(sql).run();
    return 'se pudo';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    raw.close();
  }
}

describe('libro mayor: cada evento con su identidad', () => {
  it('cada evento lleva UUID versión 7, dispositivo, número de secuencia, hora UTC y zona', () => {
    const { file } = withHistory();
    const [state] = readRows(file, 'SELECT device_id FROM ledger_state');
    const events = [
      ...readRows(file, 'SELECT id, device_id, seq, occurred_at, time_zone FROM observations'),
      ...readRows(
        file,
        'SELECT id, device_id, seq, created_at AS occurred_at, time_zone FROM evaluations',
      ),
      ...readRows(file, 'SELECT id, device_id, seq, occurred_at, time_zone FROM operations'),
    ];
    expect(events.length).toBeGreaterThanOrEqual(4);
    for (const event of events) {
      expect(event.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(event.device_id).toBe(state?.device_id);
      expect(event.occurred_at).toBe('2027-03-15T13:00:00.000Z');
      expect(event.time_zone).toBe(BUENOS_AIRES_ZONE);
    }
    // Una sola secuencia para los tres tipos de evento, sin repetidos ni saltos.
    const sequence = events.map((event) => Number(event.seq)).sort((a, b) => a - b);
    expect(sequence).toEqual(sequence.map((_, index) => index + 1));
  });

  it('el dispositivo se crea una vez y no cambia al cerrar y abrir', () => {
    const { file } = withHistory();
    const [first] = readRows(file, 'SELECT device_id FROM ledger_state');
    openDatabase(file).close();
    expect(readRows(file, 'SELECT device_id FROM ledger_state')).toEqual([first]);
  });
});

describe('libro mayor: lo que la base no deja hacer', () => {
  it('[CA-015] nadie puede modificar ni borrar una observación, una evaluación o una operación', () => {
    const { file } = withHistory();
    for (const table of ['observations', 'evaluations', 'operations']) {
      expect(tryRaw(file, `UPDATE ${table} SET seq = seq + 100`), table).toMatch(
        /el historial solo se agrega/,
      );
      expect(tryRaw(file, `DELETE FROM ${table}`), table).toMatch(/el historial solo se agrega/);
    }
    expect(readRows(file, 'SELECT count(*) AS n FROM observations')).toEqual([{ n: 1 }]);
    expect(readRows(file, 'SELECT count(*) AS n FROM evaluations')).toEqual([{ n: 1 }]);
  });

  it('las versiones de una tarjeta no se modifican, y sin permiso tampoco se borran', () => {
    const { file } = withHistory();
    expect(tryRaw(file, "UPDATE card_versions SET question = 'otra'")).toMatch(
      /las versiones no se modifican/,
    );
    expect(tryRaw(file, 'DELETE FROM card_versions')).toMatch(/las versiones no se borran/);
    expect(readRows(file, 'SELECT count(*) AS n FROM card_versions')).toEqual([{ n: 2 }]);
  });

  it('una evaluación nueva tiene que enmendar la vigente del mismo intento, en orden', () => {
    const { file } = withHistory();
    const [evaluation] = readRows(file, 'SELECT * FROM evaluations');
    const insert = (version: number, supersedes: string | null) =>
      tryRaw(
        file,
        `INSERT INTO evaluations (id, attempt_id, version, supersedes_id, verdict, source, created_at, time_zone, device_id, seq) VALUES ('${randomUUID()}', '${String(evaluation?.attempt_id)}', ${version}, ${supersedes === null ? 'NULL' : `'${supersedes}'`}, 'partial', 'user', '2027-03-15T13:00:00.000Z', '${BUENOS_AIRES_ZONE}', '${String(evaluation?.device_id)}', ${900 + version})`,
      );
    expect(insert(2, null)).toMatch(/evaluación fuera de orden/);
    expect(insert(3, String(evaluation?.id))).toMatch(/evaluación fuera de orden/);
    expect(insert(1, null)).toMatch(/UNIQUE/);
    expect(insert(2, String(evaluation?.id))).toBe('se pudo');
  });
});

describe('libro mayor: guardar dos veces', () => {
  it('[CA-018] el mismo repaso que llega dos veces queda una sola vez y no gasta número de secuencia', () => {
    const folder = tempDataFolder();
    folders.push(folder);
    const db = openDatabase(folder.file);
    const store = createCardsStore(db, demoClock());
    const card = store.create({ question: 'P', answer: 'R' });
    const attemptId = randomUUID();
    const first = store.review({ cardId: card.id, grade: 'good', attemptId });
    const [before] = readRows(folder.file, 'SELECT last_seq FROM ledger_state');
    // El segundo llega igual (un reintento, un doble toque), aunque diga otra calificación.
    const second = store.review({ cardId: card.id, grade: 'again', attemptId });
    db.close();
    expect(second).toEqual(first);
    expect(readRows(folder.file, 'SELECT count(*) AS n FROM observations')).toEqual([{ n: 1 }]);
    expect(readRows(folder.file, 'SELECT count(*) AS n FROM evaluations')).toEqual([{ n: 1 }]);
    expect(readRows(folder.file, 'SELECT last_seq FROM ledger_state')).toEqual([before]);
    expect(
      readRows(folder.file, "SELECT json_extract(payload, '$.grade') AS grade FROM observations"),
    ).toEqual([{ grade: 'good' }]);
  });

  it('dos repasos distintos de la misma tarjeta quedan los dos', () => {
    const folder = tempDataFolder();
    folders.push(folder);
    const db = openDatabase(folder.file);
    const store = createCardsStore(db, demoClock());
    const card = store.create({ question: 'P', answer: 'R' });
    store.review({ cardId: card.id, grade: 'good', attemptId: randomUUID() });
    store.review({ cardId: card.id, grade: 'hard', attemptId: randomUUID() });
    db.close();
    expect(readRows(folder.file, 'SELECT count(*) AS n FROM observations')).toEqual([{ n: 2 }]);
  });
});
