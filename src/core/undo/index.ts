// «Deshacer» en «Actividad reciente»: cada cambio de contenido queda como operación, y deshacerlo
// agrega otra operación (nunca borra ni reescribe). Solo se deshace lo que la tarjeta todavía
// conserva: si cambió después, ese renglón ya no tiene «Deshacer».

export type OperationKind =
  | 'card.create'
  | 'card.edit'
  | 'card.delete'
  | 'card.restore'
  | 'card.purge';

interface CardContent {
  readonly question: string;
  readonly answer: string;
}

export interface UndoableOperation {
  readonly kind: OperationKind;
  // La versión que había antes (solo en las ediciones).
  readonly versionBeforeId: string | null;
  // El contenido que dejó la operación.
  readonly afterContent: CardContent | null;
  readonly trashEntryId: string | null;
}

export interface CardState {
  readonly status: 'active' | 'trashed' | 'gone';
  readonly content: CardContent | null;
  // La entrada de la Papelera vigente, si la tarjeta está ahí.
  readonly activeTrashEntryId: string | null;
}

export type UndoPlan =
  | { readonly action: 'restore-version'; readonly versionId: string }
  | { readonly action: 'delete' }
  | { readonly action: 'restore-from-trash'; readonly trashEntryId: string };

function sameContent(a: CardContent | null, b: CardContent | null): boolean {
  return a !== null && b !== null && a.question === b.question && a.answer === b.answer;
}

export function undoPlan(operation: UndoableOperation, card: CardState): UndoPlan | null {
  switch (operation.kind) {
    case 'card.edit':
      return card.status === 'active' &&
        operation.versionBeforeId !== null &&
        sameContent(card.content, operation.afterContent)
        ? { action: 'restore-version', versionId: operation.versionBeforeId }
        : null;
    case 'card.create':
    case 'card.restore':
      return card.status === 'active' ? { action: 'delete' } : null;
    case 'card.delete':
      return card.status === 'trashed' &&
        operation.trashEntryId !== null &&
        card.activeTrashEntryId === operation.trashEntryId
        ? { action: 'restore-from-trash', trashEntryId: operation.trashEntryId }
        : null;
    case 'card.purge':
      return null;
  }
}

// Deshacer agrega una operación del tipo inverso.
export function undoOperationKind(plan: UndoPlan): OperationKind {
  switch (plan.action) {
    case 'restore-version':
      return 'card.edit';
    case 'delete':
      return 'card.delete';
    case 'restore-from-trash':
      return 'card.restore';
  }
}
