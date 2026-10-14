import { desc, eq } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { localDateTime } from '../core/study-day';
import { type OperationKind, undoPlan } from '../core/undo';
import { cardState, restoreTrashEntry, restoreVersion, trashCard, versionContent } from './content';
import type { ReteniaDatabase } from './database';
import type { Writer } from './orm';
import { operations } from './schema';

// «Actividad reciente» y «Deshacer» (H-06): tus últimos cambios, el más nuevo arriba. Deshacer
// agrega un cambio inverso; nunca modifica ni borra uno anterior.

interface ActivityItem {
  readonly id: string;
  readonly kind: OperationKind;
  // Si este cambio deshizo otro, el tipo de ese otro.
  readonly undoneKind: OperationKind | null;
  // La pregunta que dejó el cambio, o nada si la tarjeta se eliminó para siempre.
  readonly label: string | null;
  readonly day: string;
  readonly time: string;
  readonly canUndo: boolean;
}

export interface ActivityStore {
  recent(): ActivityItem[];
  undo(input: { operationId: string }): { undone: boolean };
}

const RECENT_LIMIT = 50;

type OperationRow = typeof operations.$inferSelect;

function planFor(db: Writer, operation: OperationRow) {
  return undoPlan(
    {
      kind: operation.kind as OperationKind,
      versionBeforeId: operation.versionBeforeId,
      afterContent: versionContent(db, operation.versionAfterId),
      trashEntryId: operation.trashEntryId,
    },
    cardState(db, operation.entityId),
  );
}

export function createActivityStore(db: ReteniaDatabase, clock: Clock): ActivityStore {
  const { orm } = db;

  return {
    // Solo tus cambios: las altas del ejemplo y los vencimientos de la Papelera no aparecen.
    recent() {
      const rows = orm
        .select()
        .from(operations)
        .where(eq(operations.source, 'user'))
        .orderBy(desc(operations.seq))
        .limit(RECENT_LIMIT)
        .all();
      return rows.map((row) => {
        const undone =
          row.undoesId === null
            ? undefined
            : orm
                .select({ kind: operations.kind })
                .from(operations)
                .where(eq(operations.id, row.undoesId))
                .get();
        const { day, time } = localDateTime(new Date(row.occurredAt));
        return {
          id: row.id,
          kind: row.kind as OperationKind,
          undoneKind: (undone?.kind as OperationKind | undefined) ?? null,
          label: versionContent(orm, row.versionAfterId ?? row.versionBeforeId)?.question ?? null,
          day,
          time,
          canUndo: planFor(orm, row) !== null,
        };
      });
    },

    undo({ operationId }) {
      return orm.transaction((tx) => {
        const operation = tx.select().from(operations).where(eq(operations.id, operationId)).get();
        if (operation?.source !== 'user') {
          return { undone: false };
        }
        const plan = planFor(tx, operation);
        if (plan === null) {
          return { undone: false };
        }
        const undoesId = operation.id;
        switch (plan.action) {
          case 'restore-version':
            restoreVersion(tx, clock, operation.entityId, plan.versionId, { undoesId });
            return { undone: true };
          case 'delete':
            trashCard(tx, clock, operation.entityId, { source: 'user', undoesId });
            return { undone: true };
          case 'restore-from-trash':
            return {
              undone: restoreTrashEntry(tx, clock, plan.trashEntryId, { source: 'user', undoesId }),
            };
        }
      });
    },
  };
}
