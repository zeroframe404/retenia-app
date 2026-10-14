import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Lo mínimo para una tarjeta de pregunta y respuesta (docs/modelo-de-datos.md, sección 2): la
// «cabeza» de la tarjeta, sus versiones de contenido y su agenda de repasos. Materias, temas,
// historial de observaciones y el resto llegan en sus fases, siempre agregando.

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
