import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../core/clock';
import type {
  ImportPackage,
  PackageCard,
  PackageContent,
  PackageMedia,
  PackageNote,
} from '../core/imports/package';
import { type ImportPlan, planImport } from '../core/imports/plan';
import { verdictOfGrade } from '../core/memory';
import { sameName } from '../core/organization';
import type { InlineNode } from '../preload/contract/notes';
import type { ReteniaDatabase } from './database';
import { newId } from './ids';
import { appendEvaluation, appendObservation, appendOperation, type EventSource } from './ledger';
import { createNoteRow, saveNoteRows } from './notes';
import type { Writer } from './orm';
import { recomputeCardSchedule, reviewFacts } from './projections';
import {
  attachments,
  blocks,
  cardAttachments,
  cardSchedule,
  cards,
  cardVersions,
  images,
  importItems,
  imports,
  subjects,
  topics,
} from './schema';

// Escribir lo importado de Anki o de RemNote (H-29). La vista previa (`plan`) no escribe nada;
// `apply` escribe todo en una sola transacción: si algo falla, no queda nada a medias. La copia
// «Antes de importar» la hace quien llama, antes. Cada elemento guarda la huella de su origen
// (`import_items`): importar otra vez el mismo archivo no duplica nada (CA-124).

export type ImportDestination =
  | { kind: 'subject'; subjectId: string }
  | { kind: 'new'; name: string };

export interface ImportRecord {
  importId: string;
  kind: 'anki' | 'remnote';
  fileName: string;
  at: string;
  subjectId: string;
  subjectName: string;
  plan: ImportPlan;
}

export interface ImportsStore {
  // La vista previa: lo que entra, lo que ya estaba y lo rechazado. No escribe nada.
  plan(pkg: ImportPackage): ImportPlan;
  // Cuándo se importó por última vez un archivo con esta huella (nulo si nunca).
  importedBefore(fileSha256: string): string | null;
  apply(input: {
    pkg: ImportPackage;
    fileName: string;
    fileSha256: string;
    destination: ImportDestination;
    // La carpeta con los medios del paquete, cada uno con su huella como nombre.
    mediaDir: string;
  }): ImportRecord;
  list(): ImportRecord[];
  get(importId: string): ImportRecord;
}

class ImportNotFoundError extends Error {
  constructor() {
    super('No encontré esa importación');
    this.name = 'ImportNotFoundError';
  }
}

class DestinationNotFoundError extends Error {
  constructor() {
    super('No encontré la materia de destino');
    this.name = 'DestinationNotFoundError';
  }
}

class MediaMismatchError extends Error {
  constructor() {
    super('Un archivo del paquete no coincide con su huella');
    this.name = 'MediaMismatchError';
  }
}

const SOURCES = { anki: 'import:anki', remnote: 'import:remnote' } as const satisfies Record<
  ImportPackage['kind'],
  EventSource
>;

const recordJson = z.strictObject({
  cards: z.strictObject({ fresh: z.number(), existing: z.number() }),
  notes: z.strictObject({ fresh: z.number(), existing: z.number() }),
  reviews: z.number(),
  withoutHistory: z.number(),
});

function existingKeysOf(db: Writer, pkg: ImportPackage): Set<string> {
  const keys = [...pkg.cards.map((card) => card.key), ...pkg.notes.map((note) => note.key)];
  const found = new Set<string>();
  // De a 500, por el tope de parámetros de SQLite.
  for (let start = 0; start < keys.length; start += 500) {
    for (const row of db
      .select({ key: importItems.sourceKey })
      .from(importItems)
      .where(inArray(importItems.sourceKey, keys.slice(start, start + 500)))
      .all()) {
      found.add(row.key);
    }
  }
  return found;
}

const textOf = (content: readonly InlineNode[]) =>
  content
    .map((node) =>
      node.type === 'text' || node.type === 'cloze'
        ? node.text
        : node.type === 'mention'
          ? node.label
          : '',
    )
    .join('');

// El archivo de un medio, a su carpeta de la carpeta de datos (por su huella; si ya está, queda).
// Se comprueba la huella: lo que llegó del proceso aislado no se cree a ciegas.
function placeMedia(from: string, folder: string, sha: string): void {
  const target = join(folder, sha);
  if (existsSync(target)) {
    return;
  }
  const bytes = readFileSync(from);
  if (createHash('sha256').update(bytes).digest('hex') !== sha) {
    throw new MediaMismatchError();
  }
  mkdirSync(folder, { recursive: true });
  const temporary = `${target}.${newId()}.tmp`;
  try {
    copyFileSync(from, temporary);
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function createImportsStore(
  db: ReteniaDatabase,
  clock: Clock,
  dataDir: string,
): ImportsStore {
  const { orm } = db;

  const recordOf = (row: typeof imports.$inferSelect): ImportRecord => {
    const subject = orm
      .select({ name: subjects.name })
      .from(subjects)
      .where(eq(subjects.id, row.subjectId))
      .get();
    const summary = recordJson.parse(JSON.parse(row.summary));
    return {
      importId: row.id,
      kind: row.kind === 'remnote' ? 'remnote' : 'anki',
      fileName: row.fileName,
      at: row.at,
      subjectId: row.subjectId,
      subjectName: subject?.name ?? '',
      plan: {
        ...summary,
        rejected: JSON.parse(row.rejected) as ImportPlan['rejected'],
        annotated: JSON.parse(row.annotated) as ImportPlan['annotated'],
      },
    };
  };

  return {
    plan: (pkg) => planImport(pkg, existingKeysOf(orm, pkg)),

    importedBefore(fileSha256) {
      return (
        orm
          .select({ at: imports.at })
          .from(imports)
          .where(eq(imports.fileSha256, fileSha256))
          .orderBy(desc(imports.at))
          .get()?.at ?? null
      );
    },

    apply({ pkg, fileName, fileSha256, destination, mediaDir }) {
      const existing = existingKeysOf(orm, pkg);
      const plan = planImport(pkg, existing);
      const freshCards = pkg.cards.filter((card) => !existing.has(card.key));
      const freshNotes = pkg.notes.filter((note) => !existing.has(note.key));
      const usedShas = new Set<string>();
      for (const card of freshCards) {
        for (const node of [...card.question, ...card.answer]) {
          if (node.type === 'image') {
            usedShas.add(node.sha);
          }
        }
        for (const sha of card.audio) {
          usedShas.add(sha);
        }
      }
      for (const note of freshNotes) {
        for (const block of note.blocks) {
          for (const node of block.content) {
            if (node.type === 'image') {
              usedShas.add(node.sha);
            }
          }
        }
      }
      const media = pkg.media.filter((item) => usedShas.has(item.sha));
      // Los archivos van antes de la transacción: tienen su huella por nombre y, si algo falla
      // después, uno que quede no se ve ni cambia nada.
      for (const item of media) {
        placeMedia(
          join(mediaDir, item.sha),
          join(dataDir, item.kind === 'image' ? 'imagenes' : 'adjuntos'),
          item.sha,
        );
      }
      const source = SOURCES[pkg.kind];
      return orm.transaction((tx) => {
        const now = clock.now().toISOString();
        const subjectId = destinationOf(tx, destination, now);
        const importId = newId();
        const topicIds = new Map<string, string>();
        const topicOf = (name: string | null): string | null => {
          if (name === null) {
            return null;
          }
          const known = topicIds.get(name);
          if (known) {
            return known;
          }
          const found = tx
            .select({ id: topics.id, name: topics.name })
            .from(topics)
            .where(and(eq(topics.subjectId, subjectId), isNull(topics.deletedAt)))
            .all()
            .find((topic) => sameName(topic.name, name));
          const id = found?.id ?? createTopic(tx, clock, subjectId, name, source, now);
          topicIds.set(name, id);
          return id;
        };
        writeMedia(tx, media, now);
        for (const card of freshCards) {
          const cardId = writeCard(tx, clock, {
            card,
            subjectId,
            topicId: topicOf(card.topic),
            source,
            now,
          });
          tx.insert(importItems)
            .values({
              sourceKey: card.key,
              importId,
              entityType: 'card',
              entityId: cardId,
              tags: JSON.stringify(card.tags),
            })
            .run();
        }
        writeNotes(tx, clock, { notes: freshNotes, subjectId, topicOf, source, importId });
        tx.insert(imports)
          .values({
            id: importId,
            kind: pkg.kind,
            fileSha256,
            fileName,
            subjectId,
            at: now,
            summary: JSON.stringify({
              cards: plan.cards,
              notes: plan.notes,
              reviews: plan.reviews,
              withoutHistory: plan.withoutHistory,
            }),
            rejected: JSON.stringify(plan.rejected),
            annotated: JSON.stringify(plan.annotated),
          })
          .run();
        const row = tx.select().from(imports).where(eq(imports.id, importId)).get();
        if (!row) {
          throw new ImportNotFoundError();
        }
        return recordOf(row);
      });
    },

    list() {
      return orm
        .select()
        .from(imports)
        .orderBy(desc(imports.at), desc(imports.id))
        .all()
        .map(recordOf);
    },

    get(importId) {
      const row = orm.select().from(imports).where(eq(imports.id, importId)).get();
      if (!row) {
        throw new ImportNotFoundError();
      }
      return recordOf(row);
    },
  };
}

function destinationOf(tx: Writer, destination: ImportDestination, now: string): string {
  if (destination.kind === 'subject') {
    const found = tx
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, destination.subjectId), isNull(subjects.deletedAt)))
      .get();
    if (!found) {
      throw new DestinationNotFoundError();
    }
    return found.id;
  }
  const name = destination.name.trim();
  // Una materia con ese nombre que ya existe se usa: importar dos veces a «Prueba de migración» no
  // arma dos materias.
  const same = tx
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(isNull(subjects.deletedAt))
    .all()
    .find((subject) => sameName(subject.name, name));
  if (same) {
    return same.id;
  }
  const id = newId();
  tx.insert(subjects).values({ id, name, createdAt: now }).run();
  return id;
}

function createTopic(
  tx: Writer,
  clock: Clock,
  subjectId: string,
  name: string,
  source: EventSource,
  now: string,
): string {
  const last = tx
    .select({ position: topics.position })
    .from(topics)
    .where(eq(topics.subjectId, subjectId))
    .all();
  const topicId = newId();
  tx.insert(topics)
    .values({
      id: topicId,
      subjectId,
      name: name.trim(),
      position: Math.max(-1, ...last.map((row) => row.position)) + 1,
      createdAt: now,
    })
    .run();
  appendOperation(tx, clock, {
    kind: 'topic.create',
    entityType: 'topic',
    entityId: topicId,
    source,
  });
  return topicId;
}

function writeMedia(tx: Writer, media: readonly PackageMedia[], now: string): void {
  for (const item of media) {
    if (item.kind === 'image' && item.width !== undefined && item.height !== undefined) {
      tx.insert(images)
        .values({
          id: newId(),
          sha256: item.sha,
          mime: item.mime,
          bytes: item.bytes,
          width: item.width,
          height: item.height,
          createdAt: now,
        })
        .onConflictDoNothing({ target: images.sha256 })
        .run();
    } else if (item.kind === 'audio') {
      tx.insert(attachments)
        .values({
          id: newId(),
          sha256: item.sha,
          name: item.name,
          mime: item.mime,
          bytes: item.bytes,
          createdAt: now,
        })
        .onConflictDoNothing({ target: attachments.sha256 })
        .run();
    }
  }
}

// El contenido del paquete como el de Retenia (las tarjetas de Anki no traen enlaces ni huecos
// sueltos: la cloze ya viene armada).
function cardContent(content: PackageContent): InlineNode[] {
  return content.flatMap((node): InlineNode[] => {
    if (node.type === 'text' || node.type === 'image') {
      return [node];
    }
    if (node.type === 'cloze') {
      return [{ type: 'text', text: node.text }];
    }
    return [{ type: 'text', text: node.label }];
  });
}

function writeCard(
  tx: Writer,
  clock: Clock,
  {
    card,
    subjectId,
    topicId,
    source,
    now,
  }: {
    card: PackageCard;
    subjectId: string;
    topicId: string | null;
    source: EventSource;
    now: string;
  },
): string {
  const cardId = newId();
  const versionId = newId();
  const question = cardContent(card.question);
  const answer = cardContent(card.answer);
  const hasImages = [...question, ...answer].some((node) => node.type === 'image');
  tx.insert(cards)
    .values({
      id: cardId,
      currentVersionId: versionId,
      createdAt: card.createdAt,
      subjectId,
      topicId,
      kind: card.kind,
      clozeId: card.kind === 'cloze' ? newId() : null,
      origin: 'import',
      pausedAt: card.suspended ? now : null,
      availableOnly: card.reviews.length === 0 ? 1 : 0,
    })
    .run();
  tx.insert(cardVersions)
    .values({
      id: versionId,
      cardId,
      question: textOf(question),
      answer: textOf(answer),
      questionContent: hasImages ? JSON.stringify(question) : null,
      answerContent: hasImages ? JSON.stringify(answer) : null,
      createdAt: card.createdAt,
      cause: 'import',
    })
    .run();
  recomputeCardSchedule(tx, cardId);
  appendOperation(tx, clock, {
    kind: 'card.create',
    entityId: cardId,
    versionAfterId: versionId,
    source,
  });
  for (const review of card.reviews) {
    const at = new Date(review.at);
    const before = tx
      .select({ dueAt: cardSchedule.dueAt })
      .from(cardSchedule)
      .where(eq(cardSchedule.cardId, cardId))
      .get();
    const observation = appendObservation(tx, clock, {
      kind: 'review.graded',
      payload: {
        cardId,
        grade: review.grade,
        helpLevel: 'A0',
        dueAtThen: before?.dueAt ?? review.at,
        versionId,
        ...reviewFacts(tx, cardId, at, false),
      },
      idempotencyKey: review.key,
      source,
      occurredAt: at,
    });
    if (observation.inserted) {
      appendEvaluation(tx, clock, {
        attemptId: observation.id,
        verdict: verdictOfGrade(review.grade),
        source,
      });
    }
    recomputeCardSchedule(tx, cardId);
  }
  for (const sha of card.audio) {
    const attachment = tx
      .select({ id: attachments.id })
      .from(attachments)
      .where(eq(attachments.sha256, sha))
      .get();
    if (attachment) {
      tx.insert(cardAttachments)
        .values({ cardId, attachmentId: attachment.id })
        .onConflictDoNothing()
        .run();
    }
  }
  return cardId;
}

// Las notas de RemNote: primero se crean todas (así los enlaces entre ellas encuentran su
// identificador) y después se guardan sus renglones, que arman sus tarjetas como cualquier renglón.
// Sus tarjetas llegan «Disponibles»: RemNote no exporta repasos.
function writeNotes(
  tx: Writer,
  clock: Clock,
  {
    notes: incoming,
    subjectId,
    topicOf,
    source,
    importId,
  }: {
    notes: readonly PackageNote[];
    subjectId: string;
    topicOf: (name: string | null) => string | null;
    source: EventSource;
    importId: string;
  },
): void {
  const noteIds = new Map<string, string>();
  const firstBlocks = new Map<string, string>();
  for (const note of incoming) {
    const noteId = createNoteRow(
      tx,
      clock,
      { subjectId, topicId: topicOf(note.topic), title: note.title },
      { source, record: true },
    );
    noteIds.set(note.key, noteId);
    const first = tx.select({ id: blocks.id }).from(blocks).where(eq(blocks.noteId, noteId)).get();
    if (first) {
      firstBlocks.set(note.key, first.id);
    }
    tx.insert(importItems)
      .values({ sourceKey: note.key, importId, entityType: 'note', entityId: noteId })
      .run();
  }
  // Un enlace a una nota que se importó otra vez antes también sirve.
  const linkTarget = (key: string): string | null => {
    const fresh = noteIds.get(key);
    if (fresh) {
      return fresh;
    }
    return (
      tx
        .select({ id: importItems.entityId })
        .from(importItems)
        .where(and(eq(importItems.sourceKey, key), eq(importItems.entityType, 'note')))
        .get()?.id ?? null
    );
  };
  for (const note of incoming) {
    const noteId = noteIds.get(note.key);
    if (!noteId) {
      continue;
    }
    const ids = new Map<string, string>();
    note.blocks.forEach((block, index) => {
      ids.set(block.key, index === 0 ? (firstBlocks.get(note.key) ?? newId()) : newId());
    });
    const rows = note.blocks.map((block) => ({
      id: ids.get(block.key) ?? newId(),
      parentId: block.parentKey === null ? null : (ids.get(block.parentKey) ?? null),
      collapsed: false,
      content: block.content.flatMap((node): InlineNode[] => {
        if (node.type === 'cloze') {
          return [{ type: 'cloze', id: newId(), text: node.text }];
        }
        if (node.type === 'link') {
          const target = linkTarget(node.target);
          return target === null
            ? [{ type: 'text', text: node.label }]
            : [{ type: 'mention', id: target, label: node.label }];
        }
        return [node];
      }),
    }));
    saveNoteRows(tx, clock, { noteId, title: note.title, blocks: rows }, source);
    // Siguen siendo tarjetas de su renglón (origen «note»): solo llegan «Disponibles».
    tx.update(cards).set({ availableOnly: 1 }).where(eq(cards.noteId, noteId)).run();
    // «::» y «<>»: además de la tarjeta del renglón, su inversa.
    for (const block of note.blocks) {
      const blockId = ids.get(block.key);
      if (!block.inverse || blockId === undefined) {
        continue;
      }
      const card = tx
        .select({ id: cards.id, topicId: cards.topicId })
        .from(cards)
        .where(and(eq(cards.blockId, blockId), isNull(cards.clozeId), isNull(cards.deletedAt)))
        .get();
      if (card) {
        writeInverse(tx, clock, card.id, source);
      }
    }
  }
}

function writeInverse(tx: Writer, clock: Clock, cardId: string, source: EventSource): void {
  const original = tx
    .select({
      subjectId: cards.subjectId,
      topicId: cards.topicId,
      siblingGroupId: cards.siblingGroupId,
      question: cardVersions.question,
      answer: cardVersions.answer,
      questionContent: cardVersions.questionContent,
      answerContent: cardVersions.answerContent,
    })
    .from(cards)
    .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
    .where(eq(cards.id, cardId))
    .get();
  if (!original) {
    return;
  }
  const groupId = original.siblingGroupId ?? newId();
  if (original.siblingGroupId === null) {
    tx.update(cards).set({ siblingGroupId: groupId }).where(eq(cards.id, cardId)).run();
  }
  const inverseId = newId();
  const versionId = newId();
  const now = clock.now().toISOString();
  tx.insert(cards)
    .values({
      id: inverseId,
      currentVersionId: versionId,
      createdAt: now,
      subjectId: original.subjectId,
      topicId: original.topicId,
      siblingGroupId: groupId,
      inverseOfCardId: cardId,
      origin: 'import',
      availableOnly: 1,
    })
    .run();
  tx.insert(cardVersions)
    .values({
      id: versionId,
      cardId: inverseId,
      question: original.answer,
      answer: original.question,
      questionContent: original.answerContent,
      answerContent: original.questionContent,
      createdAt: now,
      cause: 'import',
    })
    .run();
  recomputeCardSchedule(tx, inverseId);
  appendOperation(tx, clock, {
    kind: 'card.create',
    entityId: inverseId,
    versionAfterId: versionId,
    source,
  });
}
