import { desc, eq } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import {
  type OrganizationOperationKind,
  type OrganizationSnapshot,
  type OrganizationUndoPlan,
  undoOrganizationPlan,
} from '../core/organization';
import { localDateTime } from '../core/study-day';
import { type OperationKind, undoPlan } from '../core/undo';
import { cardState, restoreVersion, trashCard, versionContent } from './content';
import type { ReteniaDatabase } from './database';
import { inboxState, trashInboxItem } from './inbox';
import { moveNoteRow, noteState, setNoteArchived, trashNote } from './notes';
import { restoreAnyEntry } from './organization-trash';
import type { Writer } from './orm';
import { inboxItems, notes, operations, topics } from './schema';
import { activateSubjectRow, subjectName, subjectState } from './subjects';
import { renameTopicRow, setTopicArchived, topicState, trashTopic } from './topics';

// «Actividad reciente» y «Deshacer» (H-06): tus últimos cambios, el más nuevo arriba. Deshacer
// agrega un cambio inverso; nunca modifica ni borra uno anterior. Sirve para tarjetas, materias,
// temas, notas y Bandeja.

type AnyKind = OperationKind | OrganizationOperationKind;

interface ActivityItem {
  readonly id: string;
  readonly kind: AnyKind;
  // Si este cambio deshizo otro, el tipo de ese otro.
  readonly undoneKind: AnyKind | null;
  // La pregunta de la tarjeta, o el nombre de la nota, del tema o de la materia, o el texto de la
  // Bandeja, tal como están hoy; nada si ya no existen. Una nota sin título es cadena vacía.
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

function parseDetail(detail: string | null): unknown {
  if (detail === null) {
    return null;
  }
  try {
    return JSON.parse(detail);
  } catch {
    return null;
  }
}

function organizationSnapshot(
  db: Writer,
  operation: OperationRow,
  now: Date,
): OrganizationSnapshot | null {
  switch (operation.entityType) {
    case 'note':
      return noteState(db, operation.entityId, now);
    case 'topic':
      return topicState(db, operation.entityId, now);
    case 'inbox':
      return inboxState(db, operation.entityId, now);
    case 'subject':
      return subjectState(db);
    default:
      return null;
  }
}

function organizationPlanFor(
  db: Writer,
  operation: OperationRow,
  now: Date,
): OrganizationUndoPlan | null {
  const snapshot = organizationSnapshot(db, operation, now);
  return snapshot === null
    ? null
    : undoOrganizationPlan(
        {
          kind: operation.kind as OrganizationOperationKind,
          entityId: operation.entityId,
          trashEntryId: operation.trashEntryId,
          detail: parseDetail(operation.detail),
        },
        snapshot,
      );
}

function cardPlanFor(db: Writer, operation: OperationRow, now: Date) {
  return undoPlan(
    {
      kind: operation.kind as OperationKind,
      versionBeforeId: operation.versionBeforeId,
      afterContent: versionContent(db, operation.versionAfterId),
      trashEntryId: operation.trashEntryId,
    },
    cardState(db, operation.entityId, now),
  );
}

function canUndo(db: Writer, operation: OperationRow, now: Date): boolean {
  return operation.entityType === 'card'
    ? cardPlanFor(db, operation, now) !== null
    : organizationPlanFor(db, operation, now) !== null;
}

// Cómo se llama hoy lo que cambió la operación.
function labelOf(db: Writer, operation: OperationRow): string | null {
  switch (operation.entityType) {
    case 'card':
      return (
        versionContent(db, operation.versionAfterId ?? operation.versionBeforeId)?.question ?? null
      );
    case 'note':
      return (
        db.select({ title: notes.title }).from(notes).where(eq(notes.id, operation.entityId)).get()
          ?.title ?? null
      );
    case 'topic':
      return (
        db.select({ name: topics.name }).from(topics).where(eq(topics.id, operation.entityId)).get()
          ?.name ?? null
      );
    case 'inbox':
      return (
        db
          .select({ text: inboxItems.text })
          .from(inboxItems)
          .where(eq(inboxItems.id, operation.entityId))
          .get()?.text ?? null
      );
    case 'subject':
      return subjectName(db, operation.entityId);
    default:
      return null;
  }
}

function undoOrganization(
  tx: Writer,
  clock: Clock,
  operation: OperationRow,
  plan: OrganizationUndoPlan,
): boolean {
  const undoesId = operation.id;
  const options = { source: 'user' as const, undoesId };
  const id = operation.entityId;
  switch (plan.action) {
    case 'restore-from-trash':
      return restoreAnyEntry(tx, clock, plan.trashEntryId, options);
    case 'trash':
      if (operation.entityType === 'note') {
        trashNote(tx, clock, id, options);
      } else if (operation.entityType === 'topic') {
        trashTopic(tx, clock, id, options);
      } else {
        trashInboxItem(tx, clock, id, options);
      }
      return true;
    case 'archive':
    case 'unarchive':
      if (operation.entityType === 'note') {
        setNoteArchived(tx, clock, id, plan.action === 'archive', options);
      } else {
        setTopicArchived(tx, clock, id, plan.action === 'archive', options);
      }
      return true;
    case 'move':
      moveNoteRow(tx, clock, id, plan.topicId, options);
      return true;
    case 'rename':
      renameTopicRow(tx, clock, id, plan.name, options);
      return true;
    case 'activate':
      return activateSubjectRow(tx, clock, plan.subjectId, options);
  }
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
          kind: row.kind as AnyKind,
          undoneKind: (undone?.kind as AnyKind | undefined) ?? null,
          label: labelOf(orm, row),
          day,
          time,
          canUndo: canUndo(orm, row, clock.now()),
        };
      });
    },

    undo({ operationId }) {
      return orm.transaction((tx) => {
        const operation = tx.select().from(operations).where(eq(operations.id, operationId)).get();
        if (operation?.source !== 'user') {
          return { undone: false };
        }
        const now = clock.now();
        if (operation.entityType !== 'card') {
          const plan = organizationPlanFor(tx, operation, now);
          return { undone: plan !== null && undoOrganization(tx, clock, operation, plan) };
        }
        const plan = cardPlanFor(tx, operation, now);
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
              undone: restoreAnyEntry(tx, clock, plan.trashEntryId, { source: 'user', undoesId }),
            };
        }
      });
    },
  };
}
