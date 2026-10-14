import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { openWorkspace, type Workspace } from '../../src/data/workspace';
import { seedDemoCards } from '../../src/main/demo/seed';
import { tempDataFolder } from '../apoyo/base';
import { eventsById, readRows } from '../apoyo/base-cruda';

// «Actividad reciente» y «Deshacer» (H-06, CA-023): cada alta, edición y borrado queda como
// operación; deshacer agrega otra operación (nunca modifica ni borra una) y solo se ofrece
// mientras la tarjeta siga como la dejó ese cambio.

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

function workspace() {
  const folder = tempDataFolder();
  folders.push(folder);
  const opened = openWorkspace({
    dataDir: folder.folder,
    clock: demoClock(),
    appVersion: '0.0.0-prueba',
  });
  open.push(opened);
  return opened;
}

const file = (target: Workspace) => join(target.dataDir, 'retenia.db');

describe('deshacer una edición', () => {
  it('[CA-023] editar la pregunta crea una versión nueva y «Deshacer» en ese renglón crea otra igual a la anterior', () => {
    const target = workspace();
    const card = target.cards.create({ question: '¿Qué es la varianza?', answer: 'El cuadrado' });
    target.cards.edit({
      cardId: card.id,
      question: '¿Qué es la varianza? PRUEBA',
      answer: 'El cuadrado',
    });
    const [edit] = target.activity.recent();
    expect(edit).toMatchObject({
      kind: 'card.edit',
      undoneKind: null,
      label: '¿Qué es la varianza? PRUEBA',
      day: '2027-03-15',
      time: '10:00',
      canUndo: true,
    });
    const events = eventsById(file(target));

    expect(target.activity.undo({ operationId: edit?.id ?? '' })).toEqual({ undone: true });
    expect(target.cards.list()[0]?.question).toBe('¿Qué es la varianza?');
    const versions = readRows(
      file(target),
      'SELECT question, cause FROM card_versions WHERE card_id = ? ORDER BY id',
      card.id,
    );
    expect(versions).toEqual([
      { question: '¿Qué es la varianza?', cause: 'edit' },
      { question: '¿Qué es la varianza? PRUEBA', cause: 'edit' },
      { question: '¿Qué es la varianza?', cause: 'undo' },
    ]);
    // Deshacer agregó; no cambió ni borró nada de antes.
    const after = eventsById(file(target));
    for (const [id, row] of events) {
      expect(after.get(id), id).toBe(row);
    }
    const [undo, editAgain] = target.activity.recent();
    expect(undo).toMatchObject({ kind: 'card.edit', undoneKind: 'card.edit', canUndo: true });
    expect(editAgain).toMatchObject({ id: edit?.id, canUndo: false });
  });

  it('[CA-023] deshacer lo deshecho vuelve a la edición, y dos ediciones se deshacen de a una', () => {
    const target = workspace();
    const card = target.cards.create({ question: 'A', answer: 'r' });
    target.cards.edit({ cardId: card.id, question: 'B', answer: 'r' });
    target.cards.edit({ cardId: card.id, question: 'C', answer: 'r' });
    const [toC, toB] = target.activity.recent();
    target.activity.undo({ operationId: toC?.id ?? '' });
    expect(target.cards.list()[0]?.question).toBe('B');
    // La edición a «B» se puede deshacer porque la tarjeta volvió a decir «B».
    expect(target.activity.recent().find((item) => item.id === toB?.id)?.canUndo).toBe(true);
    target.activity.undo({ operationId: toB?.id ?? '' });
    expect(target.cards.list()[0]?.question).toBe('A');
    // Y deshacer el último deshacer la devuelve a «B».
    const [lastUndo] = target.activity.recent();
    target.activity.undo({ operationId: lastUndo?.id ?? '' });
    expect(target.cards.list()[0]?.question).toBe('B');
  });

  it('[CA-023] si la tarjeta cambió después, ese renglón ya no se deshace y pedirlo no cambia nada', () => {
    const target = workspace();
    const card = target.cards.create({ question: 'A', answer: 'r' });
    target.cards.edit({ cardId: card.id, question: 'B', answer: 'r' });
    const [toB] = target.activity.recent();
    target.cards.edit({ cardId: card.id, question: 'C', answer: 'r' });
    expect(target.activity.recent().find((item) => item.id === toB?.id)?.canUndo).toBe(false);
    const operations = readRows(file(target), 'SELECT count(*) AS n FROM operations');
    expect(target.activity.undo({ operationId: toB?.id ?? '' })).toEqual({ undone: false });
    expect(target.cards.list()[0]?.question).toBe('C');
    expect(readRows(file(target), 'SELECT count(*) AS n FROM operations')).toEqual(operations);
  });

  it('editar sin cambiar nada no agrega una versión ni un renglón', () => {
    const target = workspace();
    const card = target.cards.create({ question: 'A', answer: 'r' });
    target.cards.edit({ cardId: card.id, question: 'A', answer: 'r' });
    expect(target.activity.recent()).toHaveLength(1);
    expect(readRows(file(target), 'SELECT count(*) AS n FROM card_versions')).toEqual([{ n: 1 }]);
  });
});

describe('deshacer altas y borrados', () => {
  it('[CA-023] deshacer un alta manda la tarjeta a la papelera; deshacer ese borrado la devuelve', () => {
    const target = workspace();
    const card = target.cards.create({ question: '¿Capital de Francia?', answer: 'París' });
    const [creation] = target.activity.recent();
    expect(creation).toMatchObject({
      kind: 'card.create',
      label: '¿Capital de Francia?',
      canUndo: true,
    });
    target.activity.undo({ operationId: creation?.id ?? '' });
    expect(target.cards.list()).toEqual([]);
    expect(target.trash.list().map((item) => item.cardId)).toEqual([card.id]);
    const [removal] = target.activity.recent();
    expect(removal).toMatchObject({
      kind: 'card.delete',
      undoneKind: 'card.create',
      canUndo: true,
    });
    target.activity.undo({ operationId: removal?.id ?? '' });
    expect(target.cards.list().map((item) => item.id)).toEqual([card.id]);
    expect(target.verifyData()).toEqual([]);
  });

  it('[CA-022] deshacer un borrado restaura la tarjeta, igual que «Restaurar» en la papelera', () => {
    const target = workspace();
    const card = target.cards.create({ question: 'P', answer: 'R' });
    target.cards.remove({ cardId: card.id });
    const [removal] = target.activity.recent();
    expect(removal).toMatchObject({ kind: 'card.delete', canUndo: true });
    expect(target.activity.undo({ operationId: removal?.id ?? '' })).toEqual({ undone: true });
    expect(target.trash.list()).toEqual([]);
    expect(target.cards.list().map((item) => item.id)).toEqual([card.id]);
  });

  it('[CA-022] un borrado que ya venció en la papelera no ofrece «Deshacer», aunque todavía no se haya vaciado', () => {
    const folder = tempDataFolder();
    folders.push(folder);
    let days = 0;
    const target = openWorkspace({
      dataDir: folder.folder,
      clock: { now: () => demoClock(days).now() },
      appVersion: '0.0.0-prueba',
    });
    open.push(target);
    const card = target.cards.create({ question: 'P', answer: 'R' });
    target.cards.remove({ cardId: card.id });
    // «+35 días» sin cerrar Retenia: la entrada venció, pero la purga corre recién al abrir.
    days = 35;
    const [removal] = target.activity.recent();
    expect(removal).toMatchObject({ kind: 'card.delete', canUndo: false });
    expect(target.activity.undo({ operationId: removal?.id ?? '' })).toEqual({ undone: false });
    expect(target.cards.list()).toEqual([]);
  });

  it('lo vaciado de la papelera ya no se deshace y sus renglones dicen que la tarjeta se eliminó', () => {
    const target = workspace();
    const card = target.cards.create({ question: 'P', answer: 'R' });
    target.cards.edit({ cardId: card.id, question: 'P2', answer: 'R' });
    target.cards.remove({ cardId: card.id });
    target.trash.empty();
    const items = target.activity.recent();
    expect(items.map((item) => item.kind)).toEqual([
      'card.purge',
      'card.delete',
      'card.edit',
      'card.create',
    ]);
    expect(items.every((item) => item.canUndo === false)).toBe(true);
    expect(items.every((item) => item.label === null)).toBe(true);
    for (const item of items) {
      expect(target.activity.undo({ operationId: item.id })).toEqual({ undone: false });
    }
  });
});

describe('actividad reciente', () => {
  it('muestra tus cambios, el más nuevo arriba, sin las tarjetas del ejemplo', () => {
    const target = workspace();
    expect(seedDemoCards(target.cards)).toBe(3);
    expect(target.activity.recent()).toEqual([]);
    const card = target.cards.create({ question: 'Una mía', answer: 'R' });
    target.cards.remove({ cardId: card.id });
    expect(target.activity.recent().map((item) => item.kind)).toEqual([
      'card.delete',
      'card.create',
    ]);
  });

  it('muestra como mucho los últimos 50 cambios', () => {
    const target = workspace();
    const card = target.cards.create({ question: 'Q0', answer: 'R' });
    for (let index = 1; index <= 55; index++) {
      target.cards.edit({ cardId: card.id, question: `Q${index}`, answer: 'R' });
    }
    const items = target.activity.recent();
    expect(items).toHaveLength(50);
    expect(items[0]?.label).toBe('Q55');
  });
});
