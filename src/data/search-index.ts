import { and, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../core/clock';
import { formulaText, type SearchKind } from '../core/search';
import type { Writer } from './orm';
import {
  blocks,
  blockVersions,
  cards,
  cardVersions,
  doubts,
  materialBlocks,
  materials,
  notes,
  topicAliases,
  topics,
} from './schema';
import { readSetting, writeSetting } from './settings';

// El índice de búsqueda (Fase 12): dos índices FTS5 sobre las mismas filas de `search_documents`.
// Uno por palabras (`search_words`, sin tildes ni mayúsculas) y otro por pedazos de palabra de
// tres letras o más (`search_pieces`, trigramas; con una columna aparte para el texto crudo de
// fórmulas y código). Es una proyección: se puede borrar y reconstruir desde el contenido.
//
// Cómo se mantiene al día: unos disparadores de la base anotan en `search_dirty` qué cambió, y
// `flushSearchIndex` (que `openDatabase` corre al final de cada transacción, antes de confirmar)
// vuelve a armar esas filas. Así el índice y el contenido se confirman juntos o no se confirman.

// Súbelo cuando cambie qué se indexa o cómo: al abrir, un índice de otra versión se rearma.
const SEARCH_INDEX_VERSION = '1';
const VERSION_KEY = 'search.indexVersion';

interface DocRow {
  docId: string;
  kind: SearchKind;
  entityId: string;
  parentId: string | null;
  subjectId: string | null;
  topicId: string | null;
  // Lo que se muestra como título.
  label: string;
  // Lo que se indexa como título (vacío en un renglón: el título es el de su nota).
  title: string;
  body: string;
  raw: string;
  aliases: string;
  archived: 0 | 1;
  touchedAt: string;
}

const CHUNK = 200;
const LOAD_CHUNK = 500;

const list = (values: readonly string[]): SQL =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += size) {
    out.push(items.slice(at, at + size));
  }
  return out;
}

// --- Lo que se indexa -----------------------------------------------------------------------

// Cada cargador devuelve las filas que corresponden a esos identificadores (o a todas, con `null`);
// lo que no vuelve es porque ya no existe o está en la Papelera.

function loadCards(tx: Writer, ids: readonly string[] | null): DocRow[] {
  const rows = tx
    .select({
      id: cards.id,
      subjectId: cards.subjectId,
      topicId: cards.topicId,
      question: cardVersions.question,
      answer: cardVersions.answer,
      reference: cardVersions.referenceAnswer,
      explanation: cardVersions.explanation,
      touchedAt: cardVersions.createdAt,
    })
    .from(cards)
    .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
    .where(and(isNull(cards.deletedAt), ids === null ? undefined : inArray(cards.id, [...ids])))
    .all();
  return rows.map((row) => {
    const body = [row.answer, row.reference, row.explanation]
      .filter((part) => part !== '')
      .join('\n');
    return {
      docId: `card:${row.id}`,
      kind: 'card',
      entityId: row.id,
      parentId: null,
      subjectId: row.subjectId,
      topicId: row.topicId,
      label: row.question,
      title: row.question,
      body,
      raw: formulaText(`${row.question}\n${body}`),
      aliases: '',
      archived: 0,
      touchedAt: row.touchedAt,
    };
  });
}

function loadNotes(tx: Writer, ids: readonly string[] | null): DocRow[] {
  const rows = tx
    .select()
    .from(notes)
    .where(and(isNull(notes.deletedAt), ids === null ? undefined : inArray(notes.id, [...ids])))
    .all();
  return rows
    .filter((row) => row.title.trim() !== '')
    .map((row) => ({
      docId: `note:${row.id}`,
      kind: 'note',
      entityId: row.id,
      parentId: null,
      subjectId: row.subjectId,
      topicId: row.topicId,
      label: row.title,
      title: row.title,
      body: '',
      raw: '',
      aliases: '',
      archived: row.archivedAt === null ? 0 : 1,
      touchedAt: row.createdAt,
    }));
}

function loadBlocks(tx: Writer, ids: readonly string[] | null): DocRow[] {
  const rows = tx
    .select({
      id: blocks.id,
      noteId: blocks.noteId,
      text: blockVersions.textPlain,
      touchedAt: blockVersions.createdAt,
      title: notes.title,
      subjectId: notes.subjectId,
      topicId: notes.topicId,
      archivedAt: notes.archivedAt,
    })
    .from(blocks)
    .innerJoin(blockVersions, eq(blockVersions.id, blocks.currentVersionId))
    .innerJoin(notes, eq(notes.id, blocks.noteId))
    .where(
      and(
        isNull(blocks.deletedAt),
        isNull(notes.deletedAt),
        ids === null ? undefined : inArray(blocks.id, [...ids]),
      ),
    )
    .all();
  return rows
    .filter((row) => row.text.trim() !== '')
    .map((row) => ({
      docId: `block:${row.id}`,
      kind: 'block',
      entityId: row.id,
      parentId: row.noteId,
      subjectId: row.subjectId,
      topicId: row.topicId,
      label: row.title,
      title: '',
      body: row.text,
      raw: formulaText(row.text),
      aliases: '',
      archived: row.archivedAt === null ? 0 : 1,
      touchedAt: row.touchedAt,
    }));
}

function loadTopics(tx: Writer, ids: readonly string[] | null): DocRow[] {
  const rows = tx
    .select()
    .from(topics)
    .where(and(isNull(topics.deletedAt), ids === null ? undefined : inArray(topics.id, [...ids])))
    .all();
  const aliasRows =
    rows.length === 0
      ? []
      : tx.select().from(topicAliases).orderBy(topicAliases.since, topicAliases.name).all();
  const aliasesOf = new Map<string, string[]>();
  for (const alias of aliasRows) {
    aliasesOf.set(alias.topicId, [...(aliasesOf.get(alias.topicId) ?? []), alias.name]);
  }
  return rows.map((row) => {
    const aliases = (aliasesOf.get(row.id) ?? []).join('\n');
    return {
      docId: `topic:${row.id}`,
      kind: 'topic',
      entityId: row.id,
      parentId: null,
      subjectId: row.subjectId,
      topicId: row.id,
      label: row.name,
      title: row.name,
      body: aliases,
      raw: '',
      aliases,
      archived: row.archivedAt === null ? 0 : 1,
      touchedAt: row.createdAt,
    };
  });
}

function loadDoubts(tx: Writer, ids: readonly string[] | null): DocRow[] {
  const rows = tx
    .select({
      id: doubts.id,
      text: doubts.text,
      cardId: doubts.cardId,
      createdAt: doubts.createdAt,
      subjectId: cards.subjectId,
      topicId: cards.topicId,
    })
    .from(doubts)
    .leftJoin(cards, eq(cards.id, doubts.cardId))
    .where(and(isNull(doubts.resolvedAt), ids === null ? undefined : inArray(doubts.id, [...ids])))
    .all();
  return rows.map((row) => ({
    docId: `doubt:${row.id}`,
    kind: 'doubt',
    entityId: row.id,
    parentId: row.cardId,
    subjectId: row.subjectId,
    topicId: row.topicId,
    label: row.text,
    title: row.text,
    body: '',
    raw: formulaText(row.text),
    aliases: '',
    archived: 0,
    touchedAt: row.createdAt,
  }));
}

// Un material (su título y el texto que no cae en ninguna sección) y cada una de sus secciones (su
// título y el texto de lo que cuelga directo de ella). Lo que tiene error o está borrado no se
// indexa. Las fórmulas y el código van también como texto crudo.
function loadMaterials(tx: Writer, ids: readonly string[] | null): DocRow[] {
  const rows = tx
    .select()
    .from(materials)
    .where(
      and(
        isNull(materials.deletedAt),
        isNull(materials.errorCode),
        ids === null ? undefined : inArray(materials.id, [...ids]),
      ),
    )
    .all();
  if (rows.length === 0) {
    return [];
  }
  const blockRows = tx
    .select({
      id: materialBlocks.id,
      materialId: materialBlocks.materialId,
      parentId: materialBlocks.parentId,
      type: materialBlocks.type,
      text: materialBlocks.normalizedText,
    })
    .from(materialBlocks)
    .where(
      inArray(
        materialBlocks.materialId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(materialBlocks.materialId, materialBlocks.position)
    .all();
  const docs: DocRow[] = [];
  for (const row of rows) {
    const own = blockRows.filter((block) => block.materialId === row.id);
    const sectionIds = new Set(own.filter((block) => block.type === 'section').map((b) => b.id));
    const textOf = (parent: string | null) =>
      own.filter(
        (block) =>
          block.type !== 'section' &&
          block.type !== 'header' &&
          block.type !== 'footer' &&
          (parent === null
            ? block.parentId === null || !sectionIds.has(block.parentId)
            : block.parentId === parent),
      );
    const loose = textOf(null);
    const rawOf = (blocks: typeof own) =>
      blocks
        .filter((block) => block.type === 'formula' || block.type === 'code')
        .map((block) => block.text)
        .join('\n');
    docs.push({
      docId: `material:${row.id}`,
      kind: 'material',
      entityId: row.id,
      parentId: null,
      subjectId: row.subjectId,
      topicId: null,
      label: row.title,
      title: row.title,
      body: loose.map((block) => block.text).join('\n'),
      raw: rawOf(loose),
      aliases: '',
      archived: 0,
      touchedAt: row.addedAt,
    });
    for (const section of own.filter((block) => block.type === 'section')) {
      const inside = textOf(section.id);
      docs.push({
        docId: `section:${section.id}`,
        kind: 'section',
        entityId: section.id,
        parentId: row.id,
        subjectId: row.subjectId,
        topicId: null,
        label: section.text,
        title: section.text,
        body: inside.map((block) => block.text).join('\n'),
        raw: rawOf(inside),
        aliases: '',
        archived: 0,
        touchedAt: row.addedAt,
      });
    }
  }
  return docs;
}

const LOADERS: Record<string, (tx: Writer, ids: readonly string[] | null) => DocRow[]> = {
  card: loadCards,
  note: loadNotes,
  block: loadBlocks,
  topic: loadTopics,
  doubt: loadDoubts,
  material: loadMaterials,
};

// Todo lo que debería estar en el índice, tal como está hoy el contenido.
function expectedDocuments(tx: Writer): Map<string, DocRow> {
  const all = new Map<string, DocRow>();
  for (const load of Object.values(LOADERS)) {
    for (const doc of load(tx, null)) {
      all.set(doc.docId, doc);
    }
  }
  return all;
}

// --- Escribir el índice ---------------------------------------------------------------------

// Escribe las filas y saca las que ya no están, en lotes: a cada lote le saca primero lo viejo de
// los dos índices, después deja la fila y por último las vuelve a poner en los índices.
function writeDocuments(tx: Writer, docs: readonly DocRow[], removed: readonly string[]): void {
  for (const batch of chunks(removed, CHUNK)) {
    const inList = list(batch);
    tx.run(
      sql`DELETE FROM search_words WHERE rowid IN (SELECT id FROM search_documents WHERE doc_id IN (${inList}))`,
    );
    tx.run(
      sql`DELETE FROM search_pieces WHERE rowid IN (SELECT id FROM search_documents WHERE doc_id IN (${inList}))`,
    );
    tx.run(sql`DELETE FROM search_documents WHERE doc_id IN (${inList})`);
  }
  for (const batch of chunks(docs, CHUNK)) {
    const inList = list(batch.map((doc) => doc.docId));
    tx.run(
      sql`DELETE FROM search_words WHERE rowid IN (SELECT id FROM search_documents WHERE doc_id IN (${inList}))`,
    );
    tx.run(
      sql`DELETE FROM search_pieces WHERE rowid IN (SELECT id FROM search_documents WHERE doc_id IN (${inList}))`,
    );
    const values = sql.join(
      batch.map(
        (doc) =>
          sql`(${doc.docId}, ${doc.kind}, ${doc.entityId}, ${doc.parentId}, ${doc.subjectId}, ${doc.topicId}, ${doc.label}, ${doc.title}, ${doc.body}, ${doc.raw}, ${doc.aliases}, ${doc.archived}, ${doc.touchedAt})`,
      ),
      sql`, `,
    );
    tx.run(sql`INSERT INTO search_documents
      (doc_id, kind, entity_id, parent_id, subject_id, topic_id, label, title, body, raw, aliases, archived, touched_at)
      VALUES ${values}
      ON CONFLICT(doc_id) DO UPDATE SET kind = excluded.kind, entity_id = excluded.entity_id,
        parent_id = excluded.parent_id, subject_id = excluded.subject_id, topic_id = excluded.topic_id,
        label = excluded.label, title = excluded.title, body = excluded.body, raw = excluded.raw,
        aliases = excluded.aliases, archived = excluded.archived, touched_at = excluded.touched_at`);
    tx.run(
      sql`INSERT INTO search_words (rowid, title, body) SELECT id, title, body FROM search_documents WHERE doc_id IN (${inList})`,
    );
    tx.run(
      sql`INSERT INTO search_pieces (rowid, title, body, raw) SELECT id, title, body, raw FROM search_documents WHERE doc_id IN (${inList})`,
    );
  }
}

// Vuelve a armar lo que cambió desde la última vez. Devuelve cuántas cosas revisó.
export function flushSearchIndex(tx: Writer): number {
  const dirty = tx.all<{ kind: string; entity_id: string }>(
    sql`SELECT kind, entity_id FROM search_dirty`,
  );
  if (dirty.length === 0) {
    return 0;
  }
  tx.run(sql`DELETE FROM search_dirty`);
  const byKind = new Map<string, Set<string>>();
  for (const { kind, entity_id } of dirty) {
    byKind.set(kind, (byKind.get(kind) ?? new Set()).add(entity_id));
  }
  // Una nota que cambia (el título, el tema, si está archivada) cambia a todos sus renglones.
  const noteIds = [...(byKind.get('note') ?? [])];
  for (const batch of chunks(noteIds, LOAD_CHUNK)) {
    const rows = tx.all<{ id: string }>(
      sql`SELECT id FROM blocks WHERE note_id IN (${list(batch)})`,
    );
    const set = byKind.get('block') ?? new Set<string>();
    for (const row of rows) {
      set.add(row.id);
    }
    byKind.set('block', set);
  }
  // Una tarjeta que cambia (de materia o de tema) cambia a las dudas que se guardaron sobre ella.
  const cardIds = [...(byKind.get('card') ?? [])];
  for (const batch of chunks(cardIds, LOAD_CHUNK)) {
    const rows = tx.all<{ id: string }>(
      sql`SELECT id FROM doubts WHERE card_id IN (${list(batch)})`,
    );
    const set = byKind.get('doubt') ?? new Set<string>();
    for (const row of rows) {
      set.add(row.id);
    }
    byKind.set('doubt', set);
  }
  const docs: DocRow[] = [];
  const removed: string[] = [];
  let checked = 0;
  for (const [kind, ids] of byKind) {
    const load = LOADERS[kind];
    if (!load) {
      continue;
    }
    for (const batch of chunks([...ids], LOAD_CHUNK)) {
      const found = load(tx, batch);
      const foundIds = new Set(found.map((doc) => doc.docId));
      docs.push(...found);
      removed.push(...batch.map((id) => `${kind}:${id}`).filter((docId) => !foundIds.has(docId)));
      // Las secciones de un material que se volvió a leer (o se borró) y ya no están.
      if (kind === 'material') {
        const stale = tx.all<{ doc_id: string }>(
          sql`SELECT doc_id FROM search_documents WHERE kind = 'section' AND parent_id IN (${list(batch)})`,
        );
        removed.push(...stale.map((row) => row.doc_id).filter((docId) => !foundIds.has(docId)));
      }
      checked += batch.length;
    }
  }
  writeDocuments(tx, docs, removed);
  return checked;
}

// --- Crear y reconstruir --------------------------------------------------------------------

function indexTablesExist(tx: Writer): boolean {
  const found = tx.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE name IN ('search_words', 'search_pieces')`,
  );
  return found.length === 2;
}

// Vuelve a armar todo el índice desde el contenido. Devuelve cuántas cosas indexó.
export function rebuildSearchIndex(tx: Writer): number {
  tx.run(sql`DELETE FROM search_words`);
  tx.run(sql`DELETE FROM search_pieces`);
  tx.run(sql`DELETE FROM search_documents`);
  tx.run(sql`DELETE FROM search_dirty`);
  const docs = [...expectedDocuments(tx).values()];
  writeDocuments(tx, docs, []);
  return docs.length;
}

// Al abrir la base: crea los dos índices si no están (una base de antes de la búsqueda, o una copia
// vieja) y los arma de nuevo si son de otra versión.
export function ensureSearchIndex(tx: Writer, clock: Clock): void {
  const missing = !indexTablesExist(tx);
  if (missing) {
    tx.run(sql`DROP TABLE IF EXISTS search_words`);
    tx.run(sql`DROP TABLE IF EXISTS search_pieces`);
    tx.run(
      sql`CREATE VIRTUAL TABLE search_words USING fts5(title, body, tokenize = 'unicode61 remove_diacritics 2')`,
    );
    tx.run(
      sql`CREATE VIRTUAL TABLE search_pieces USING fts5(title, body, raw, tokenize = 'trigram remove_diacritics 1')`,
    );
  }
  if (missing || readSetting(tx, VERSION_KEY, z.string(), '') !== SEARCH_INDEX_VERSION) {
    rebuildSearchIndex(tx);
    writeSetting(tx, clock, VERSION_KEY, SEARCH_INDEX_VERSION);
  } else {
    flushSearchIndex(tx);
  }
}

// --- Comprobar el índice --------------------------------------------------------------------

export interface IndexDifference {
  // La cosa que no coincide, para decirlo con su nombre; nada si lo que falla es el índice mismo.
  label: string | null;
}

// Compara el índice con el contenido: las filas, y que los dos índices tengan lo mismo que ellas.
export function verifySearchIndex(tx: Writer): IndexDifference[] {
  const differences: IndexDifference[] = [];
  const expected = expectedDocuments(tx);
  const stored = new Map(
    tx
      .all<{
        doc_id: string;
        kind: string;
        entity_id: string;
        touched_at: string;
        label: string;
        title: string;
        body: string;
        raw: string;
        aliases: string;
        subject_id: string | null;
        topic_id: string | null;
        parent_id: string | null;
        archived: number;
      }>(
        sql`SELECT doc_id, kind, entity_id, touched_at, label, title, body, raw, aliases, subject_id, topic_id, parent_id, archived FROM search_documents`,
      )
      .map((row) => [row.doc_id, row]),
  );
  for (const [docId, doc] of expected) {
    const row = stored.get(docId);
    if (
      !row ||
      row.kind !== doc.kind ||
      row.entity_id !== doc.entityId ||
      row.touched_at !== doc.touchedAt ||
      row.label !== doc.label ||
      row.title !== doc.title ||
      row.body !== doc.body ||
      row.raw !== doc.raw ||
      row.aliases !== doc.aliases ||
      row.subject_id !== doc.subjectId ||
      row.topic_id !== doc.topicId ||
      row.parent_id !== doc.parentId ||
      row.archived !== doc.archived
    ) {
      differences.push({ label: doc.label === '' ? doc.body : doc.label });
    }
  }
  for (const [docId, row] of stored) {
    if (!expected.has(docId)) {
      differences.push({ label: row.label });
    }
  }
  // Los dos índices tienen que tener exactamente las filas, con el mismo texto.
  const count = (query: SQL) => tx.get<{ n: number }>(query)?.n ?? 0;
  const orphans =
    count(
      sql`SELECT COUNT(*) AS n FROM search_documents WHERE id NOT IN (SELECT rowid FROM search_words)`,
    ) +
    count(
      sql`SELECT COUNT(*) AS n FROM search_documents WHERE id NOT IN (SELECT rowid FROM search_pieces)`,
    ) +
    count(
      sql`SELECT COUNT(*) AS n FROM search_words WHERE rowid NOT IN (SELECT id FROM search_documents)`,
    ) +
    count(
      sql`SELECT COUNT(*) AS n FROM search_pieces WHERE rowid NOT IN (SELECT id FROM search_documents)`,
    ) +
    count(
      sql`SELECT COUNT(*) AS n FROM search_documents d JOIN search_words w ON w.rowid = d.id WHERE w.title IS NOT d.title OR w.body IS NOT d.body`,
    ) +
    count(
      sql`SELECT COUNT(*) AS n FROM search_documents d JOIN search_pieces p ON p.rowid = d.id WHERE p.title IS NOT d.title OR p.body IS NOT d.body OR p.raw IS NOT d.raw`,
    );
  if (orphans > 0 && differences.length === 0) {
    differences.push({ label: null });
  }
  return differences;
}
