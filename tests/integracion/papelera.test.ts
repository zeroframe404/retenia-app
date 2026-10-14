import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { type Clock, demoClock } from '../../src/core/clock';
import { openWorkspace, type Workspace } from '../../src/data/workspace';
import { tempDataFolder } from '../apoyo/base';
import { eventsById, readRows } from '../apoyo/base-cruda';

// La Papelera (H-06, CA-022): eliminar no borra nada durante 30 días y «Restaurar» devuelve la
// tarjeta con su historial. Vaciarla (o el vencimiento) elimina el contenido para siempre, pero
// nunca un evento del historial.

const folders: ReturnType<typeof tempDataFolder>[] = [];
const open: Workspace[] = [];
afterEach(() => {
  for (const workspace of open.splice(0)) {
    workspace.close();
  }
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

function workspace(clock: Clock = demoClock(), dataDir?: string) {
  let dir = dataDir;
  if (!dir) {
    const folder = tempDataFolder();
    folders.push(folder);
    dir = folder.folder;
  }
  const opened = openWorkspace({ dataDir: dir, clock, appVersion: '0.0.0-prueba' });
  open.push(opened);
  return opened;
}

function closeIt(target: Workspace) {
  target.close();
  open.splice(open.indexOf(target), 1);
}

// «¿Qué mide el desvío estándar?» repasada dos veces y otra tarjeta sin repasar.
function withHistory(target: Workspace) {
  const card = target.cards.create({
    question: '¿Qué mide el desvío estándar?',
    answer: 'Cuánto se alejan, en promedio, los datos de la media.',
  });
  const other = target.cards.create({ question: '¿Qué es la varianza?', answer: 'El cuadrado' });
  target.cards.review({ cardId: card.id, grade: 'good', attemptId: randomUUID() });
  target.cards.review({ cardId: card.id, grade: 'hard', attemptId: randomUUID() });
  return { card, other };
}

describe('papelera', () => {
  it('[CA-022] eliminar manda la tarjeta a la papelera por 30 días y la saca de la lista', () => {
    const target = workspace();
    const { card, other } = withHistory(target);
    const { trashEntryId } = target.cards.remove({ cardId: card.id });
    expect(target.cards.list().map((listed) => listed.id)).toEqual([other.id]);
    expect(target.trash.list()).toEqual([
      {
        id: trashEntryId,
        cardId: card.id,
        question: '¿Qué mide el desvío estándar?',
        deletedDay: '2027-03-15',
        expiresDay: '2027-04-14',
      },
    ]);
    // Nada se borró: la tarjeta, sus versiones, su agenda y su historial siguen.
    expect(
      readRows(target.dataDir.concat('/retenia.db'), 'SELECT count(*) AS n FROM card_versions'),
    ).toEqual([{ n: 2 }]);
    expect(target.verifyData()).toEqual([]);
  });

  it('[CA-022] «Restaurar» la devuelve a la lista con su historial y su agenda', () => {
    const target = workspace();
    const { card } = withHistory(target);
    const listed = target.cards.list().find((item) => item.id === card.id);
    const history = target.cards.history({ cardId: card.id });
    const { trashEntryId } = target.cards.remove({ cardId: card.id });

    expect(target.trash.restore({ entryId: trashEntryId })).toEqual({ restored: true });
    expect(target.cards.list().find((item) => item.id === card.id)).toEqual(listed);
    expect(target.cards.history({ cardId: card.id })).toEqual(history);
    expect(target.trash.list()).toEqual([]);
    expect(target.verifyData()).toEqual([]);
  });

  it('restaurar una entrada que ya no está en la papelera no cambia nada', () => {
    const target = workspace();
    const { card } = withHistory(target);
    const { trashEntryId } = target.cards.remove({ cardId: card.id });
    expect(target.trash.restore({ entryId: trashEntryId })).toEqual({ restored: true });
    const operations = readRows(
      `${target.dataDir}/retenia.db`,
      'SELECT count(*) AS n FROM operations',
    );
    expect(target.trash.restore({ entryId: trashEntryId })).toEqual({ restored: false });
    expect(target.trash.restore({ entryId: randomUUID() })).toEqual({ restored: false });
    expect(
      readRows(`${target.dataDir}/retenia.db`, 'SELECT count(*) AS n FROM operations'),
    ).toEqual(operations);
  });

  it('[CA-022] a los 30 días se elimina para siempre y su historial de repasos queda', () => {
    const target = workspace();
    const { card } = withHistory(target);
    target.cards.remove({ cardId: card.id });
    const events = eventsById(`${target.dataDir}/retenia.db`);
    closeIt(target);

    // Un día antes del vencimiento sigue ahí.
    const day29 = workspace(demoClock(29), target.dataDir);
    expect(day29.trash.purgeExpired()).toEqual({ purged: 0 });
    expect(day29.trash.list()).toHaveLength(1);
    closeIt(day29);

    const day30 = workspace(demoClock(30), target.dataDir);
    expect(day30.trash.purgeExpired()).toEqual({ purged: 1 });
    expect(day30.trash.list()).toEqual([]);
    const file = `${target.dataDir}/retenia.db`;
    expect(readRows(file, 'SELECT count(*) AS n FROM cards WHERE id = ?', card.id)).toEqual([
      { n: 0 },
    ]);
    expect(
      readRows(file, 'SELECT count(*) AS n FROM card_versions WHERE card_id = ?', card.id),
    ).toEqual([{ n: 0 }]);
    expect(readRows(file, 'SELECT count(*) AS n FROM purge_permits')).toEqual([{ n: 0 }]);
    // Todos los eventos de antes siguen idénticos; se agregó el del vencimiento.
    const after = eventsById(file);
    for (const [id, row] of events) {
      expect(after.get(id), id).toBe(row);
    }
    expect(readRows(file, "SELECT kind, source FROM operations WHERE kind = 'card.purge'")).toEqual(
      [{ kind: 'card.purge', source: 'system' }],
    );
    expect(
      readRows(file, 'SELECT count(*) AS n FROM observations WHERE card_id = ?', card.id),
    ).toEqual([{ n: 2 }]);
    expect(day30.verifyData()).toEqual([]);
  });

  it('una entrada vencida deja de verse aunque todavía no se haya eliminado', () => {
    const target = workspace();
    const { card } = withHistory(target);
    target.cards.remove({ cardId: card.id });
    closeIt(target);
    const later = workspace(demoClock(35), target.dataDir);
    expect(later.trash.list()).toEqual([]);
    expect(later.cards.list().find((item) => item.id === card.id)).toBeUndefined();
  });

  it('«Vaciar papelera» elimina para siempre lo que hay en ella, sin tocar las demás tarjetas ni un evento', () => {
    const target = workspace();
    const { card, other } = withHistory(target);
    const third = target.cards.create({ question: '¿Qué es la media?', answer: 'El promedio' });
    target.cards.remove({ cardId: card.id });
    target.cards.remove({ cardId: third.id });
    const file = `${target.dataDir}/retenia.db`;
    const events = eventsById(file);

    expect(target.trash.empty()).toEqual({ purged: 2 });
    expect(target.trash.list()).toEqual([]);
    expect(target.cards.list().map((item) => item.id)).toEqual([other.id]);
    const after = eventsById(file);
    for (const [id, row] of events) {
      expect(after.get(id), id).toBe(row);
    }
    expect(
      readRows(
        file,
        "SELECT count(*) AS n FROM operations WHERE kind = 'card.purge' AND source = 'user'",
      ),
    ).toEqual([{ n: 2 }]);
    expect(target.verifyData()).toEqual([]);
    // Vaciar todo no hace que la base parezca nueva (el ejemplo no se vuelve a sembrar).
    target.cards.remove({ cardId: other.id });
    target.trash.empty();
    expect(target.cards.count()).toBe(0);
    expect(target.cards.isPristine()).toBe(false);
  });

  it('una tarjeta en la papelera no se puede repasar, editar ni volver a eliminar', () => {
    const target = workspace();
    const { card } = withHistory(target);
    target.cards.remove({ cardId: card.id });
    expect(() =>
      target.cards.review({ cardId: card.id, grade: 'good', attemptId: randomUUID() }),
    ).toThrow('No encontré la tarjeta');
    expect(() => target.cards.edit({ cardId: card.id, question: 'x', answer: 'y' })).toThrow(
      'No encontré la tarjeta',
    );
    expect(() => target.cards.remove({ cardId: card.id })).toThrow('No encontré la tarjeta');
  });
});
