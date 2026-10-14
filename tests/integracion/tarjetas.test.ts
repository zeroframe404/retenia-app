import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { demoClock, fixedClock } from '../../src/core/clock';
import { CardNotFoundError, createCardsStore } from '../../src/data/cards';
import { openDatabase } from '../../src/data/database';
import { newId } from '../../src/data/ids';
import { formatLongDate } from '../../src/preload/contract/texts';
import { tempDataFolder } from '../apoyo/base';
import { inBuenosAires } from '../apoyo/fechas';

const folders: ReturnType<typeof tempDataFolder>[] = [];
function freshFolder() {
  const folder = tempDataFolder();
  folders.push(folder);
  return folder;
}
afterEach(() => {
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

describe('tarjetas con la base real: alta, listado y repaso', () => {
  it('[CA-009] la tarjeta «¿Capital de Francia?» con «París» sigue en la lista al cerrar y abrir la base', () => {
    const { file } = freshFolder();
    const first = openDatabase(file);
    createCardsStore(first, demoClock()).create({
      question: '¿Capital de Francia?',
      answer: 'París',
    });
    first.close();

    const second = openDatabase(file);
    const list = createCardsStore(second, demoClock()).list();
    second.close();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      question: '¿Capital de Francia?',
      answer: 'París',
      nextReviewDay: null,
    });
  });

  it('[CA-009] la tarjeta nueva queda primera en la lista, aunque el reloj no avance', () => {
    const { file } = freshFolder();
    const db = openDatabase(file);
    const store = createCardsStore(db, demoClock());
    for (const question of ['Primera', 'Segunda', 'Tercera']) {
      store.create({ question, answer: 'x' });
    }
    expect(store.list().map((card) => card.question)).toEqual(['Tercera', 'Segunda', 'Primera']);
    db.close();
  });

  it('[CA-009] el texto larguísimo, con ñ, tildes y emoji, se guarda completo y sin cambios', () => {
    const { file } = freshFolder();
    const question = `${'Año nuevo, cañón y corazón 🙂 '.repeat(3000)}fin`;
    const answer = 'Respuesta con ñ, tildes y 🙂';
    const db = openDatabase(file);
    createCardsStore(db, demoClock()).create({ question, answer });
    db.close();

    const reopened = openDatabase(file);
    const [card] = createCardsStore(reopened, demoClock()).list();
    reopened.close();
    expect(card?.question).toBe(question);
    expect(card?.answer).toBe(answer);
  });

  it('[CA-010] «La sabía» sobre una tarjeta nueva el 15/03/2027 deja «miércoles 17/03/2027» y queda guardado al cerrar y abrir', () => {
    const { file } = freshFolder();
    const db = openDatabase(file);
    const store = createCardsStore(db, demoClock());
    const created = store.create({ question: '¿Capital de Francia?', answer: 'París' });
    const reviewed = store.review({ cardId: created.id, grade: 'good' });
    expect(reviewed.nextReviewDay).toBe('2027-03-17');
    expect(formatLongDate(reviewed.nextReviewDay ?? '')).toBe('miércoles 17/03/2027');
    db.close();

    const reopened = openDatabase(file);
    const [card] = createCardsStore(reopened, demoClock()).list();
    reopened.close();
    expect(card?.nextReviewDay).toBe('2027-03-17');
  });

  it('[CA-010] «Con dudas» y «No la sabía» sobre una tarjeta nueva dejan el martes 16/03/2027', () => {
    const { file } = freshFolder();
    const db = openDatabase(file);
    const store = createCardsStore(db, demoClock());
    const hard = store.create({ question: 'Con dudas', answer: 'x' });
    const again = store.create({ question: 'No la sabía', answer: 'x' });
    expect(store.review({ cardId: hard.id, grade: 'hard' }).nextReviewDay).toBe('2027-03-16');
    expect(store.review({ cardId: again.id, grade: 'again' }).nextReviewDay).toBe('2027-03-16');
    db.close();
  });

  it('[CA-010] repasar otra vez el día del vencimiento cuenta desde ese día y alarga el intervalo', () => {
    const { file } = freshFolder();
    const db = openDatabase(file);
    const created = createCardsStore(db, demoClock()).create({ question: 'P', answer: 'R' });
    createCardsStore(db, demoClock()).review({ cardId: created.id, grade: 'good' });
    const onDueDay = createCardsStore(db, fixedClock(inBuenosAires('17/03/2027 10:00')));
    const again = onDueDay.review({ cardId: created.id, grade: 'good' });
    db.close();
    expect(again.nextReviewDay).not.toBeNull();
    expect((again.nextReviewDay ?? '') > '2027-03-19').toBe(true);
  });

  it('[CA-010] repasar una tarjeta que no existe falla con un error propio y no escribe nada', () => {
    const { file } = freshFolder();
    const db = openDatabase(file);
    const store = createCardsStore(db, demoClock());
    store.create({ question: 'P', answer: 'R' });
    expect(() =>
      store.review({ cardId: '01969f1e-0000-7000-8000-000000000000', grade: 'good' }),
    ).toThrow(CardNotFoundError);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.nextReviewDay).toBeNull();
    db.close();
  });

  it('guarda la tarjeta con su versión y su agenda, con la hora del reloj inyectado', () => {
    const { file } = freshFolder();
    const db = openDatabase(file);
    const card = createCardsStore(db, demoClock()).create({ question: 'P', answer: 'R' });
    db.close();

    const raw = new Database(file, { readonly: true });
    const head = raw.prepare('SELECT * FROM cards WHERE id = ?').get(card.id) as Record<
      string,
      unknown
    >;
    const version = raw
      .prepare('SELECT * FROM card_versions WHERE id = ?')
      .get(head.current_version_id) as Record<string, unknown>;
    const schedule = raw
      .prepare('SELECT * FROM card_schedule WHERE card_id = ?')
      .get(card.id) as Record<string, unknown>;
    raw.close();
    expect(head.created_at).toBe('2027-03-15T13:00:00.000Z');
    expect(head.deleted_at).toBeNull();
    expect(version).toMatchObject({ card_id: card.id, question: 'P', answer: 'R', cause: 'edit' });
    expect(schedule).toMatchObject({ card_id: card.id, reps: 0, lapses: 0 });
  });

  it('cuenta las tarjetas guardadas', () => {
    const { file } = freshFolder();
    const db = openDatabase(file);
    const store = createCardsStore(db, demoClock());
    expect(store.count()).toBe(0);
    store.create({ question: 'A', answer: 'a' });
    store.create({ question: 'B', answer: 'b' });
    expect(store.count()).toBe(2);
    db.close();
  });
});

describe('base de datos: apertura y migraciones', () => {
  it('abre en modo WAL con synchronous FULL y claves foráneas encendidas', () => {
    const { file } = freshFolder();
    const db = openDatabase(file);
    expect(db.settings()).toEqual({ journalMode: 'wal', synchronous: 'FULL', foreignKeys: true });
    db.close();
  });

  it('la primera migración queda registrada y abrir de nuevo no la repite', () => {
    const { file } = freshFolder();
    openDatabase(file).close();
    openDatabase(file).close();
    const raw = new Database(file, { readonly: true });
    const applied = raw.prepare('SELECT id FROM schema_migrations ORDER BY id').all();
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    raw.close();
    expect(applied).toEqual([{ id: '0000_tarjetas' }]);
    expect(tables).toEqual(
      expect.arrayContaining(['card_schedule', 'card_versions', 'cards', 'schema_migrations']),
    );
  });

  it('crea la carpeta de datos si todavía no existe', () => {
    const { folder } = freshFolder();
    const nested = `${folder}/primera-vez/datos`;
    openDatabase(`${nested}/retenia.db`).close();
    const raw = new Database(`${nested}/retenia.db`, { readonly: true });
    expect(raw.open).toBe(true);
    raw.close();
  });

  it('una versión de tarjeta no puede apuntar a una tarjeta que no existe', () => {
    const { file } = freshFolder();
    const db = openDatabase(file);
    db.close();
    const raw = new Database(file);
    raw.pragma('foreign_keys = ON');
    const insert = raw.prepare(
      'INSERT INTO card_versions (id, card_id, question, answer, created_at, cause) VALUES (?, ?, ?, ?, ?, ?)',
    );
    expect(() => insert.run('v', 'no-existe', 'P', 'R', 'ahora', 'edit')).toThrow();
    raw.close();
  });
});

describe('identificadores', () => {
  it('son únicos, tienen forma de UUID versión 7 y crecen aunque se creen en el mismo milisegundo', () => {
    const ids = Array.from({ length: 5000 }, () => newId());
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect(ids).toEqual([...ids].sort());
  });
});
