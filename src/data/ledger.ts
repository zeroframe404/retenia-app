import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { BUENOS_AIRES_ZONE, type Clock } from '../core/clock';
import { currentEvaluation, nextEvaluation } from '../core/ledger';
import type { Verdict } from '../core/memory';
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

// Lo esencial de cada tipo de observación, versión 1 del esquema. Los esquemas viejos se
// conservan para leer historial viejo; uno nuevo sube la versión.
const PAYLOADS = {
  // Un repaso de una tarjeta: el botón que se tocó, sin ayuda (las pistas llegan en la Fase 16)
  // y la fecha en que vencía.
  'review.graded': z.strictObject({
    cardId: z.uuid(),
    grade: z.enum(['again', 'hard', 'good']),
    helpLevel: z.literal('A0'),
    dueAtThen: z.iso.datetime(),
  }),
  // La agenda que traía una tarjeta de la Fase 03, repasada antes de que existiera el libro.
  'schedule.adopted': z.strictObject({ cardId: z.uuid(), memory: memorySnapshot }),
};
const SCHEMA_VERSION = 1;

export type ObservationKind = keyof typeof PAYLOADS;
export type ObservationPayload<K extends ObservationKind> = z.output<(typeof PAYLOADS)[K]>;

export function readPayload<K extends ObservationKind>(
  kind: K,
  schemaVersion: number,
  payload: string,
): ObservationPayload<K> {
  if (schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`No sé leer la versión ${schemaVersion} de «${kind}»`);
  }
  return PAYLOADS[kind].parse(JSON.parse(payload)) as ObservationPayload<K>;
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
  const payload = JSON.stringify(PAYLOADS[input.kind].parse(input.payload));
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
      schemaVersion: SCHEMA_VERSION,
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
    kind: OperationKind;
    entityId: string;
    versionBeforeId?: string | null;
    versionAfterId?: string | null;
    trashEntryId?: string | null;
    undoesId?: string | null;
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
      entityType: 'card',
      entityId: input.entityId,
      versionBeforeId: input.versionBeforeId ?? null,
      versionAfterId: input.versionAfterId ?? null,
      trashEntryId: input.trashEntryId ?? null,
      undoesId: input.undoesId ?? null,
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
