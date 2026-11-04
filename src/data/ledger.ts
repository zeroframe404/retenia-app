import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { BUENOS_AIRES_ZONE, type Clock } from '../core/clock';
import { currentEvaluation, nextEvaluation } from '../core/ledger';
import type { Verdict } from '../core/memory';
import type { OrganizationOperationKind } from '../core/organization';
import type { OperationKind } from '../core/undo';
import { newId } from './ids';
import type { Writer } from './orm';
import { evaluations, ledgerState, observations, operations } from './schema';

// El libro mayor (docs/modelo-de-datos.md, sección 1). Todo lo de acá solo agrega filas: los
// disparadores de la migración 0002 rechazan cualquier intento de modificar o borrar un evento.
// Cada evento lleva un UUID v7 generado antes de guardar, el dispositivo, un número de
// secuencia (uno solo para los tres tipos de evento), la hora en UTC y la zona.

// Quién originó el evento: vos, Retenia (al adoptar datos viejos) o la siembra del ejemplo.
export type EventSource = 'user' | 'system' | 'demo';

// Sobre qué clase de cosa se hizo una operación.
export type OperationEntity = 'card' | 'subject' | 'topic' | 'note' | 'inbox';

const memorySnapshot = z.strictObject({
  state: z.number().int(),
  stability: z.number(),
  difficulty: z.number(),
  dueAt: z.iso.datetime(),
  lastReviewAt: z.iso.datetime().nullable(),
  reps: z.number().int(),
  lapses: z.number().int(),
  scheduledDays: z.number().int(),
});

const reviewGradedV1 = z.strictObject({
  cardId: z.uuid(),
  grade: z.enum(['again', 'hard', 'good']),
  helpLevel: z.literal('A0'),
  dueAtThen: z.iso.datetime(),
  // La versión de la tarjeta que se evaluó (Fase 08). Los repasos de antes no la traen.
  versionId: z.uuid().optional(),
});

// Fase 09: además de lo de la versión 1, la ayuda de la escala única y lo que decía el motor en el
// momento del intento.
const reviewGradedV2 = z.strictObject({
  cardId: z.uuid(),
  grade: z.enum(['again', 'hard', 'good']),
  helpLevel: z.enum(['A0', 'A1', 'A2', 'A3', 'A4']),
  dueAtThen: z.iso.datetime(),
  versionId: z.uuid().optional(),
  // La probabilidad de recordarla que predecía el motor (nula en una tarjeta nueva).
  predictedRecall: z.number().min(0).max(1).nullable(),
  // Los días de estudio desde el repaso anterior que contó (nulo en el primero).
  elapsedDays: z.number().int().nonnegative().nullable(),
  // Por qué apareció: vencida, reaprendizaje, elegida por mí o sondeo.
  rule: z.enum(['due', 'relearning', 'chosen', 'probe']),
  // Con qué motor y qué parámetros se calculó, la retención de la materia y si llevó la variación
  // al azar del uso real.
  engineVersion: z.number().int().positive(),
  parametersVersion: z.string().min(1),
  retention: z.number().gt(0).lte(1),
  fuzz: z.boolean(),
});

// Lo esencial de cada tipo de observación, por versión del esquema. Los esquemas viejos se
// conservan para leer historial viejo; uno nuevo sube la versión y se escribe siempre con la
// última.
const PAYLOADS = {
  // Un repaso de una tarjeta: el botón que se tocó, la ayuda y la fecha en que vencía.
  'review.graded': { 1: reviewGradedV1, 2: reviewGradedV2 },
  // «Deshacer» un repaso (Fase 09): el repaso queda en el historial y deja de contar.
  'review.annulled': { 1: z.strictObject({ cardId: z.uuid(), reviewId: z.uuid() }) },
  // Cambió lo que hay que recordar (Fase 08): la tarjeta vuelve a programarse como nueva.
  'card.meaning_changed': { 1: z.strictObject({ cardId: z.uuid(), versionId: z.uuid() }) },
  // La agenda que traía una tarjeta de la Fase 03, repasada antes de que existiera el libro.
  'schedule.adopted': { 1: z.strictObject({ cardId: z.uuid(), memory: memorySnapshot }) },
};
const CURRENT_VERSION = {
  'review.graded': 2,
  'review.annulled': 1,
  'card.meaning_changed': 1,
  'schedule.adopted': 1,
} as const;

type Payloads = typeof PAYLOADS;
export type ObservationKind = keyof Payloads;
type CurrentVersion<K extends ObservationKind> = (typeof CURRENT_VERSION)[K];
// Lo que se escribe hoy: siempre la última versión del esquema.
export type ObservationPayload<K extends ObservationKind> = z.output<
  Payloads[K][CurrentVersion<K> & keyof Payloads[K]] & z.ZodType
>;
// Lo que se puede leer: cualquiera de las versiones que existieron.
type StoredPayload<K extends ObservationKind> = z.output<
  Payloads[K][keyof Payloads[K]] & z.ZodType
>;

function schemaOf(kind: ObservationKind, version: number): z.ZodType | undefined {
  const versions: Record<number, z.ZodType> = PAYLOADS[kind];
  return versions[version];
}

export function readPayload<K extends ObservationKind>(
  kind: K,
  schemaVersion: number,
  payload: string,
): StoredPayload<K> {
  const schema = schemaOf(kind, schemaVersion);
  if (!schema) {
    throw new Error(`No sé leer la versión ${schemaVersion} de «${kind}»`);
  }
  return schema.parse(JSON.parse(payload)) as StoredPayload<K>;
}

// La primera vez que se abre una base, se crea su dispositivo.
export function ensureLedgerState(db: Writer, now: Date): void {
  db.insert(ledgerState)
    .values({ id: 1, deviceId: newId(), lastSeq: 0, createdAt: now.toISOString() })
    .onConflictDoNothing()
    .run();
}

export function readLedgerState(db: Writer): { deviceId: string; lastSeq: number } {
  const row = db
    .select({ deviceId: ledgerState.deviceId, lastSeq: ledgerState.lastSeq })
    .from(ledgerState)
    .where(eq(ledgerState.id, 1))
    .get();
  if (!row) {
    throw new Error('El libro mayor no tiene dispositivo');
  }
  return row;
}

// Al restaurar una copia vieja, el dispositivo sigue siendo este y la secuencia sigue desde el
// número más alto que ya usó: así un par (dispositivo, número) nunca se repite.
export function continueSequence(db: Writer, live: { deviceId: string; lastSeq: number }): void {
  db.update(ledgerState)
    .set({
      deviceId: live.deviceId,
      lastSeq: sql`max(${ledgerState.lastSeq}, ${live.lastSeq})`,
    })
    .where(eq(ledgerState.id, 1))
    .run();
}

function nextSeq(tx: Writer): { deviceId: string; seq: number } {
  const row = tx
    .update(ledgerState)
    .set({ lastSeq: sql`${ledgerState.lastSeq} + 1` })
    .where(eq(ledgerState.id, 1))
    .returning({ deviceId: ledgerState.deviceId, seq: ledgerState.lastSeq })
    .get();
  if (!row) {
    throw new Error('El libro mayor no tiene dispositivo');
  }
  return row;
}

// Agrega una observación. Si ya hay una con la misma clave de idempotencia (el mismo repaso que
// llega dos veces), no agrega nada ni gasta número de secuencia y devuelve la que estaba.
export function appendObservation<K extends ObservationKind>(
  tx: Writer,
  clock: Clock,
  input: {
    kind: K;
    payload: ObservationPayload<K>;
    idempotencyKey: string;
    source: EventSource;
    occurredAt?: Date;
  },
): { id: string; inserted: boolean } {
  const existing = tx
    .select({ id: observations.id })
    .from(observations)
    .where(eq(observations.idempotencyKey, input.idempotencyKey))
    .get();
  if (existing) {
    return { id: existing.id, inserted: false };
  }
  const schemaVersion = CURRENT_VERSION[input.kind];
  const schema = schemaOf(input.kind, schemaVersion);
  if (!schema) {
    throw new Error(`No hay esquema para «${input.kind}»`);
  }
  const payload = JSON.stringify(schema.parse(input.payload));
  const now = clock.now();
  const { deviceId, seq } = nextSeq(tx);
  const id = newId();
  const result = tx
    .insert(observations)
    .values({
      id,
      kind: input.kind,
      occurredAt: (input.occurredAt ?? now).toISOString(),
      recordedAt: now.toISOString(),
      timeZone: BUENOS_AIRES_ZONE,
      deviceId,
      seq,
      payload,
      schemaVersion,
      idempotencyKey: input.idempotencyKey,
      source: input.source,
    })
    .onConflictDoNothing({ target: observations.idempotencyKey })
    .run();
  if (result.changes !== 1) {
    // No puede pasar dentro de la misma transacción; si pasara, se deshace todo.
    throw new Error('La observación ya estaba guardada');
  }
  return { id, inserted: true };
}

// Agrega una evaluación de un intento: la versión 1 si no tenía, o la siguiente apuntando a la
// vigente (enmendar nunca cambia la anterior).
export function appendEvaluation(
  tx: Writer,
  clock: Clock,
  input: { attemptId: string; verdict: Verdict; source: EventSource },
): { id: string; version: number } {
  const versions = tx
    .select({ id: evaluations.id, version: evaluations.version })
    .from(evaluations)
    .where(eq(evaluations.attemptId, input.attemptId))
    .all();
  const { version, supersedesId } = nextEvaluation(currentEvaluation(versions));
  const { deviceId, seq } = nextSeq(tx);
  const id = newId();
  tx.insert(evaluations)
    .values({
      id,
      attemptId: input.attemptId,
      version,
      supersedesId,
      verdict: input.verdict,
      source: input.source,
      createdAt: clock.now().toISOString(),
      timeZone: BUENOS_AIRES_ZONE,
      deviceId,
      seq,
    })
    .run();
  return { id, version };
}

// Agrega una operación al registro de «Actividad reciente» y «Deshacer».
export function appendOperation(
  tx: Writer,
  clock: Clock,
  input: {
    kind: OperationKind | OrganizationOperationKind;
    // Qué clase de cosa cambió (por defecto, una tarjeta).
    entityType?: OperationEntity;
    entityId: string;
    versionBeforeId?: string | null;
    versionAfterId?: string | null;
    trashEntryId?: string | null;
    undoesId?: string | null;
    // Lo que hace falta para deshacer, como objeto (se guarda como JSON).
    detail?: Record<string, unknown>;
    source: EventSource;
  },
): { id: string } {
  const now = clock.now().toISOString();
  const { deviceId, seq } = nextSeq(tx);
  const id = newId();
  tx.insert(operations)
    .values({
      id,
      kind: input.kind,
      entityType: input.entityType ?? 'card',
      entityId: input.entityId,
      versionBeforeId: input.versionBeforeId ?? null,
      versionAfterId: input.versionAfterId ?? null,
      trashEntryId: input.trashEntryId ?? null,
      undoesId: input.undoesId ?? null,
      detail: input.detail === undefined ? null : JSON.stringify(input.detail),
      source: input.source,
      occurredAt: now,
      recordedAt: now,
      timeZone: BUENOS_AIRES_ZONE,
      deviceId,
      seq,
    })
    .run();
  return { id };
}
