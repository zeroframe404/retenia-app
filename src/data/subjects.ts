import { asc, count, eq, isNull } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import {
  activateSubject,
  type IncomingBlock,
  SUBJECT_STATUSES,
  type SubjectSnapshot,
  sameName,
} from '../core/organization';
import type { Subject, SubjectStatus } from '../preload/contract/organization';
import { texts } from '../preload/contract/texts';
import type { ReteniaDatabase } from './database';
import { newId } from './ids';
import { appendOperation, type EventSource } from './ledger';
import { createNoteRow, noteOf, saveNoteRows } from './notes';
import { DuplicateNameError, SubjectNotFoundError } from './organization-errors';
import type { Writer } from './orm';
import { subjects } from './schema';
import { createTopicRow } from './topics';

// Las materias (H-09): hay una sola activa. «Hacer activa» pasa a la anterior a «En mantenimiento».

export interface SubjectsStore {
  list(): { subjects: Subject[] };
  create(input: { name: string; makeActive?: boolean }): Subject;
  activate(input: { subjectId: string }): { subjects: Subject[] };
  // «Probar con un ejemplo (3 min)»: la materia «Ejemplo», una sola vez.
  createExample(options?: { activate?: boolean }, context?: { source?: EventSource }): Subject;
  // Cuántas materias hay: sin ninguna es la primera vez.
  count(): number;
}

type SubjectRow = typeof subjects.$inferSelect;

function asStatus(value: string): SubjectStatus {
  return SUBJECT_STATUSES.find((status) => status === value) ?? 'maintenance';
}

function toSubject(row: SubjectRow): Subject {
  return { id: row.id, name: row.name, status: asStatus(row.status), isExample: row.isExample };
}

function liveSubjects(db: Writer): SubjectRow[] {
  return db
    .select()
    .from(subjects)
    .where(isNull(subjects.deletedAt))
    .orderBy(asc(subjects.createdAt), asc(subjects.id))
    .all();
}

// La activa primero, después mantenimiento, pausa y archivadas; dentro de cada grupo, por creación.
function listSubjects(db: Writer): Subject[] {
  const rows = liveSubjects(db);
  return SUBJECT_STATUSES.flatMap((status) =>
    rows.filter((row) => asStatus(row.status) === status).map(toSubject),
  );
}

function assertNameFree(db: Writer, name: string): void {
  if (liveSubjects(db).some((row) => sameName(row.name, name))) {
    throw new DuplicateNameError();
  }
}

// Escribe los estados que cambiaron.
function applyStatuses(tx: Writer, rows: readonly SubjectRow[], next: readonly Subject[]): void {
  for (const subject of next) {
    const before = rows.find((row) => row.id === subject.id);
    if (before && asStatus(before.status) !== subject.status) {
      tx.update(subjects).set({ status: subject.status }).where(eq(subjects.id, subject.id)).run();
    }
  }
}

function makeActive(tx: Writer, subjectId: string): void {
  const rows = liveSubjects(tx);
  applyStatuses(tx, rows, activateSubject(rows.map(toSubject), subjectId));
}

// «Hacer activa»: devuelve si cambió algo (la que ya está activa no hace nada ni deja operación).
export function activateSubjectRow(
  tx: Writer,
  clock: Clock,
  subjectId: string,
  { source, undoesId = null }: { source: EventSource; undoesId?: string | null },
): boolean {
  const rows = liveSubjects(tx);
  const target = rows.find((row) => row.id === subjectId);
  if (!target) {
    throw new SubjectNotFoundError();
  }
  if (asStatus(target.status) === 'active') {
    return false;
  }
  const previous = rows.find((row) => asStatus(row.status) === 'active');
  applyStatuses(tx, rows, activateSubject(rows.map(toSubject), subjectId));
  appendOperation(tx, clock, {
    kind: 'subject.activate',
    entityType: 'subject',
    entityId: subjectId,
    detail: {
      previousActiveId: previous?.id ?? null,
      // Para que «Deshacer» la deje como estaba (en pausa, archivada); «en mantenimiento» es lo habitual.
      ...(asStatus(target.status) === 'maintenance'
        ? {}
        : { activatedPreviousStatus: asStatus(target.status) }),
    },
    undoesId,
    source,
  });
  return true;
}

// Cómo está la materia activa, para saber si «Hacer activa» todavía se puede deshacer.
export function subjectState(db: Writer): SubjectSnapshot {
  const rows = liveSubjects(db);
  return {
    entity: 'subject',
    activeSubjectId: rows.find((row) => asStatus(row.status) === 'active')?.id ?? null,
    isUsable: (subjectId) =>
      rows.some((row) => row.id === subjectId && asStatus(row.status) !== 'archived'),
  };
}

// El nombre de una materia para «Actividad reciente».
export function subjectName(db: Writer, subjectId: string): string | null {
  return (
    db.select({ name: subjects.name }).from(subjects).where(eq(subjects.id, subjectId)).get()
      ?.name ?? null
  );
}

export function createSubjectsStore(db: ReteniaDatabase, clock: Clock): SubjectsStore {
  const { orm } = db;

  return {
    list() {
      return { subjects: listSubjects(orm) };
    },

    create({ name, makeActive: activate = false }) {
      return orm.transaction((tx) => {
        const clean = name.trim();
        assertNameFree(tx, clean);
        const id = newId();
        tx.insert(subjects).values({ id, name: clean, createdAt: clock.now().toISOString() }).run();
        if (activate) {
          makeActive(tx, id);
        }
        const created = listSubjects(tx).find((subject) => subject.id === id);
        if (!created) {
          throw new SubjectNotFoundError();
        }
        return created;
      });
    },

    activate({ subjectId }) {
      return orm.transaction((tx) => {
        activateSubjectRow(tx, clock, subjectId, { source: 'user' });
        return { subjects: listSubjects(tx) };
      });
    },

    createExample({ activate = true } = {}, { source = 'system' } = {}) {
      return orm.transaction((tx) => {
        const existing = liveSubjects(tx).find((row) => row.isExample);
        if (existing) {
          if (activate && asStatus(existing.status) !== 'active') {
            makeActive(tx, existing.id);
          }
          return (
            listSubjects(tx).find((subject) => subject.id === existing.id) ?? toSubject(existing)
          );
        }
        assertNameFree(tx, texts.example.subject);
        const subjectId = newId();
        tx.insert(subjects)
          .values({
            id: subjectId,
            name: texts.example.subject,
            status: 'paused',
            isExample: true,
            createdAt: clock.now().toISOString(),
          })
          .run();
        if (activate) {
          makeActive(tx, subjectId);
        }
        const topicId = createTopicRow(
          tx,
          clock,
          { subjectId, name: texts.example.topic },
          { source },
        );
        const noteId = createNoteRow(tx, clock, { subjectId, topicId }, { source, record: true });
        saveNoteRows(tx, clock, {
          noteId,
          title: texts.example.note,
          blocks: exampleBlocks(noteOf(tx, noteId).blocks[0]?.id ?? newId()),
        });
        const created = listSubjects(tx).find((subject) => subject.id === subjectId);
        if (!created) {
          throw new SubjectNotFoundError();
        }
        return created;
      });
    },

    count() {
      return (
        orm.select({ total: count() }).from(subjects).where(isNull(subjects.deletedAt)).get()
          ?.total ?? 0
      );
    },
  };
}

// Los renglones del catálogo: profundidad 0 es raíz y 1 es hijo del anterior de profundidad 0. El
// primero es el renglón vacío con el que nace la nota.
function exampleBlocks(firstId: string): IncomingBlock[] {
  const result: IncomingBlock[] = [];
  let lastRoot: string | null = null;
  for (const block of texts.example.blocks) {
    const id = result.length === 0 ? firstId : newId();
    const parentId = block.depth === 0 ? null : lastRoot;
    if (block.depth === 0) {
      lastRoot = id;
    }
    result.push({ id, parentId, collapsed: false, content: [{ type: 'text', text: block.text }] });
  }
  return result;
}
