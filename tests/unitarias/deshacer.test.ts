import { describe, expect, it } from 'vitest';
import {
  type CardState,
  type UndoableOperation,
  undoOperationKind,
  undoPlan,
} from '../../src/core/undo';

// «Deshacer» en «Actividad reciente»: cada cambio se deshace agregando otro, y solo cuando la
// tarjeta sigue como la dejó ese cambio.

const before = { question: '¿Qué es la varianza?', answer: 'El promedio de los cuadrados.' };
const after = { question: '¿Qué es la varianza? PRUEBA', answer: 'El promedio de los cuadrados.' };

const edit: UndoableOperation = {
  kind: 'card.edit',
  versionBeforeId: 'v1',
  afterContent: after,
  trashEntryId: null,
};
const active = (content = after): CardState => ({
  status: 'active',
  content,
  activeTrashEntryId: null,
});
const trashed = (entry: string): CardState => ({
  status: 'trashed',
  content: after,
  activeTrashEntryId: entry,
});
const gone: CardState = { status: 'gone', content: null, activeTrashEntryId: null };

describe('deshacer: qué se puede y qué hace', () => {
  it('[CA-023] una edición se deshace volviendo a la versión anterior mientras la tarjeta siga así', () => {
    expect(undoPlan(edit, active())).toEqual({ action: 'restore-version', versionId: 'v1' });
  });

  it('[CA-023] si la tarjeta cambió después, esa edición ya no se deshace', () => {
    expect(undoPlan(edit, active(before))).toBeNull();
    expect(undoPlan(edit, active({ ...after, answer: 'Otra respuesta' }))).toBeNull();
  });

  it('[CA-023] una edición de una tarjeta en la papelera o eliminada para siempre no se deshace', () => {
    expect(undoPlan(edit, trashed('p1'))).toBeNull();
    expect(undoPlan(edit, gone)).toBeNull();
  });

  it('una edición sin versión anterior no se puede deshacer', () => {
    expect(undoPlan({ ...edit, versionBeforeId: null }, active())).toBeNull();
  });

  it('[CA-023] un alta o una restauración se deshacen mandando la tarjeta a la papelera', () => {
    for (const kind of ['card.create', 'card.restore'] as const) {
      const operation: UndoableOperation = {
        kind,
        versionBeforeId: null,
        afterContent: after,
        trashEntryId: kind === 'card.restore' ? 'p1' : null,
      };
      expect(undoPlan(operation, active())).toEqual({ action: 'delete' });
      expect(undoPlan(operation, trashed('p2'))).toBeNull();
      expect(undoPlan(operation, gone)).toBeNull();
    }
  });

  it('[CA-022] un borrado se deshace restaurando de la papelera, solo con esa misma entrada', () => {
    const removal: UndoableOperation = {
      kind: 'card.delete',
      versionBeforeId: null,
      afterContent: after,
      trashEntryId: 'p1',
    };
    expect(undoPlan(removal, trashed('p1'))).toEqual({
      action: 'restore-from-trash',
      trashEntryId: 'p1',
    });
    expect(undoPlan(removal, trashed('p9'))).toBeNull();
    expect(undoPlan(removal, active())).toBeNull();
    expect(undoPlan(removal, gone)).toBeNull();
  });

  it('vaciar la papelera no se deshace nunca', () => {
    const purge: UndoableOperation = {
      kind: 'card.purge',
      versionBeforeId: null,
      afterContent: null,
      trashEntryId: 'p1',
    };
    expect(undoPlan(purge, trashed('p1'))).toBeNull();
    expect(undoPlan(purge, gone)).toBeNull();
  });

  it('deshacer agrega un cambio del tipo inverso: editar, eliminar o restaurar', () => {
    expect(undoOperationKind({ action: 'restore-version', versionId: 'v1' })).toBe('card.edit');
    expect(undoOperationKind({ action: 'delete' })).toBe('card.delete');
    expect(undoOperationKind({ action: 'restore-from-trash', trashEntryId: 'p1' })).toBe(
      'card.restore',
    );
  });
});
