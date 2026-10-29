import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// Las tablas de Retenia (docs/modelo-de-datos.md). Solo se agregan: una migración aplicada no
// se edita y nunca se borra ni se renombra nada.

// --- Contenido: la «cabeza» de la tarjeta, sus versiones y su agenda (Fase 03) ---

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    currentVersionId: text('current_version_id').notNull(),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [index('cards_created_idx').on(table.createdAt, table.id)],
);

export const cardVersions = sqliteTable(
  'card_versions',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    createdAt: text('created_at').notNull(),
    cause: text('cause').notNull().default('edit'),
  },
  (table) => [index('card_versions_card_idx').on(table.cardId)],
);

// La agenda de cada tarjeta es una proyección: se recalcula entera desde el historial.
export const cardSchedule = sqliteTable(
  'card_schedule',
  {
    cardId: text('card_id')
      .primaryKey()
      .references(() => cards.id),
    state: integer('state').notNull(),
    stability: real('stability').notNull(),
    difficulty: real('difficulty').notNull(),
    dueAt: text('due_at').notNull(),
    lastReviewAt: text('last_review_at'),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    retentionTarget: real('retention_target').notNull().default(0.9),
  },
  (table) => [index('card_schedule_due_idx').on(table.dueAt)],
);

// --- Libro mayor (Fase 04): eventos que solo se agregan ---

// El dispositivo que escribe esta base y el último número de secuencia que usó. Una sola fila.
export const ledgerState = sqliteTable('ledger_state', {
  id: integer('id').primaryKey(),
  deviceId: text('device_id').notNull(),
  lastSeq: integer('last_seq').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

// Lo que pasó. Nunca se modifica ni se borra (lo impiden disparadores de la migración 0002).
export const observations = sqliteTable(
  'observations',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    occurredAt: text('occurred_at').notNull(),
    recordedAt: text('recorded_at').notNull(),
    timeZone: text('time_zone').notNull(),
    deviceId: text('device_id').notNull(),
    seq: integer('seq').notNull(),
    payload: text('payload').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    source: text('source').notNull(),
    cardId: text('card_id').generatedAlwaysAs(sql`json_extract(payload, '$.cardId')`, {
      mode: 'virtual',
    }),
  },
  (table) => [
    uniqueIndex('observations_idempotency_key_unique').on(table.idempotencyKey),
    uniqueIndex('observations_device_seq_unique').on(table.deviceId, table.seq),
    index('observations_kind_occurred_idx').on(table.kind, table.occurredAt),
    index('observations_card_idx').on(table.cardId, table.seq),
  ],
);

// Cómo se calificó un intento. Se enmienda agregando una versión que apunta a la anterior.
export const evaluations = sqliteTable(
  'evaluations',
  {
    id: text('id').primaryKey(),
    attemptId: text('attempt_id')
      .notNull()
      .references(() => observations.id),
    version: integer('version').notNull(),
    supersedesId: text('supersedes_id'),
    verdict: text('verdict').notNull(),
    source: text('source').notNull(),
    createdAt: text('created_at').notNull(),
    timeZone: text('time_zone').notNull(),
    deviceId: text('device_id').notNull(),
    seq: integer('seq').notNull(),
  },
  (table) => [
    uniqueIndex('evaluations_attempt_version_unique').on(table.attemptId, table.version),
    uniqueIndex('evaluations_device_seq_unique').on(table.deviceId, table.seq),
  ],
);

// Cada alta, edición, borrado, restauración y vaciado: el registro de «Actividad reciente» y de
// «Deshacer». Sin claves foráneas hacia versiones ni papelera: sobrevive a vaciarla.
export const operations = sqliteTable(
  'operations',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    versionBeforeId: text('version_before_id'),
    versionAfterId: text('version_after_id'),
    trashEntryId: text('trash_entry_id'),
    undoesId: text('undoes_id'),
    source: text('source').notNull(),
    occurredAt: text('occurred_at').notNull(),
    recordedAt: text('recorded_at').notNull(),
    timeZone: text('time_zone').notNull(),
    deviceId: text('device_id').notNull(),
    seq: integer('seq').notNull(),
    // Lo que hace falta para deshacer (Fase 07): el tema de antes, el nombre de antes, la materia
    // activa de antes. JSON.
    detail: text('detail'),
  },
  (table) => [
    uniqueIndex('operations_device_seq_unique').on(table.deviceId, table.seq),
    index('operations_entity_idx').on(table.entityType, table.entityId, table.seq),
  ],
);

// La Papelera (operativa: marca cuándo se restauró o se vació).
export const trashEntries = sqliteTable(
  'trash_entries',
  {
    id: text('id').primaryKey(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    deletedAt: text('deleted_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    restoredAt: text('restored_at'),
    purgedAt: text('purged_at'),
  },
  (table) => [
    index('trash_entries_expires_idx').on(table.expiresAt),
    index('trash_entries_entity_idx').on(table.entityType, table.entityId),
  ],
);

// El permiso para borrar las versiones de una tarjeta al vaciar la papelera. Vive dentro de una
// sola transacción: se agrega, se borran las versiones y se saca.
export const purgePermits = sqliteTable(
  'purge_permits',
  {
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.entityType, table.entityId] })],
);

// --- Organización (Fase 07): materias, temas, notas, renglones, imágenes y Bandeja ---

export const subjects = sqliteTable('subjects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // active, maintenance, paused o archived (la lista cerrada vive en core/organization).
  status: text('status').notNull().default('maintenance'),
  // La materia «Ejemplo»: lleva la etiqueta EJEMPLO y no suma progreso.
  isExample: integer('is_example', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const topics = sqliteTable(
  'topics',
  {
    id: text('id').primaryKey(),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id),
    name: text('name').notNull(),
    // El orden de creación dentro de la materia.
    position: integer('position').notNull(),
    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [index('topics_subject_idx').on(table.subjectId)],
);

// «Otros nombres» de un tema: los que tuvo antes (CA-044).
export const topicAliases = sqliteTable(
  'topic_aliases',
  {
    topicId: text('topic_id')
      .notNull()
      .references(() => topics.id),
    name: text('name').notNull(),
    since: text('since').notNull(),
  },
  (table) => [primaryKey({ columns: [table.topicId, table.name] })],
);

export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    subjectId: text('subject_id')
      .notNull()
      .references(() => subjects.id),
    // Sin tema es nulo; un tema que se purgó también lo deja nulo.
    topicId: text('topic_id').references(() => topics.id),
    title: text('title').notNull().default(''),
    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [index('notes_subject_topic_idx').on(table.subjectId, table.topicId)],
);

// Un renglón de una nota: la «cabeza» con su lugar. Lo que dice vive en sus versiones.
export const blocks = sqliteTable(
  'blocks',
  {
    id: text('id').primaryKey(),
    noteId: text('note_id')
      .notNull()
      .references(() => notes.id),
    parentBlockId: text('parent_block_id'),
    position: integer('position').notNull(),
    // Plegado: es del lugar, no del contenido (no crea versión).
    collapsed: integer('collapsed', { mode: 'boolean' }).notNull().default(false),
    currentVersionId: text('current_version_id').notNull(),
    createdAt: text('created_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    index('blocks_note_parent_idx').on(table.noteId, table.parentBlockId, table.position),
  ],
);

// Las versiones de un renglón no se modifican (disparador de la migración 0004).
export const blockVersions = sqliteTable(
  'block_versions',
  {
    id: text('id').primaryKey(),
    blockId: text('block_id')
      .notNull()
      .references(() => blocks.id),
    // El JSON de lo que hay adentro del renglón: texto, enlaces e imágenes.
    content: text('content').notNull(),
    // El texto que usará el buscador (lleva el texto fuente de las fórmulas).
    textPlain: text('text_plain').notNull(),
    createdAt: text('created_at').notNull(),
    cause: text('cause').notNull().default('edit'),
  },
  (table) => [index('block_versions_block_idx').on(table.blockId)],
);

// Los renglones que enlazan a una nota (para «Mencionada en»). Sin clave foránea hacia la nota
// enlazada: purgar una nota saca los enlaces que apuntan a ella.
export const blockLinks = sqliteTable(
  'block_links',
  {
    blockId: text('block_id')
      .notNull()
      .references(() => blocks.id),
    targetNoteId: text('target_note_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.blockId, table.targetNoteId] }),
    index('block_links_target_idx').on(table.targetNoteId),
  ],
);

// Las imágenes de las notas: el archivo vive en `imagenes\<sha256>` de la carpeta de datos.
export const images = sqliteTable(
  'images',
  {
    id: text('id').primaryKey(),
    sha256: text('sha256').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('images_sha256_unique').on(table.sha256)],
);

// La Bandeja: líneas sueltas, sin materia ni tema, hasta que se las mueve a un tema.
export const inboxItems = sqliteTable('inbox_items', {
  id: text('id').primaryKey(),
  text: text('text').notNull(),
  createdAt: text('created_at').notNull(),
  // La nota en la que se convirtió (sin clave foránea: la nota puede purgarse).
  movedToNoteId: text('moved_to_note_id'),
  movedAt: text('moved_at'),
  deletedAt: text('deleted_at'),
});
