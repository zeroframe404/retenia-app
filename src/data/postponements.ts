import { and, eq, inArray, like } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { studyDayOf } from '../core/study-day';
import { appendObservation, readPayload } from './ledger';
import type { Writer } from './orm';
import { observations } from './schema';

// Los aplazamientos (Fase 11, H-22). Posponer es un evento propio: guarda la fecha que sugería el
// motor, la nueva fecha planificada y el motivo. Nunca califica ni mueve la agenda de la tarjeta
// (no es de los tipos de evento que la recalculan): lo único que cambia es cuándo vuelve a
// proponerse y cuánta prioridad gana. Un repaso de verdad (el día real) vuelve a empezar la cuenta.

export interface PostponementState {
  // Cuántas veces se pospuso desde el último repaso que valió.
  readonly count: number;
  // La fecha planificada más reciente (nula si no se pospuso desde ese repaso).
  readonly plannedDay: string | null;
}

const NONE: PostponementState = { count: 0, plannedDay: null };

// El estado de aplazamiento de cada tarjeta. Los repasos anulados no reinician la cuenta.
export function postponementStates(
  db: Writer,
  cardIds: readonly string[],
): Map<string, PostponementState> {
  const states = new Map<string, PostponementState>();
  if (cardIds.length === 0) {
    return states;
  }
  const rows = db
    .select({
      id: observations.id,
      kind: observations.kind,
      cardId: observations.cardId,
      at: observations.occurredAt,
      payload: observations.payload,
      version: observations.schemaVersion,
    })
    .from(observations)
    .where(
      and(
        inArray(observations.cardId, [...cardIds]),
        inArray(observations.kind, ['review.postponed', 'review.graded', 'review.annulled']),
      ),
    )
    .orderBy(observations.seq)
    .all();
  const annulled = new Set(
    rows.flatMap((row) =>
      row.kind === 'review.annulled'
        ? [readPayload('review.annulled', row.version, row.payload).reviewId]
        : [],
    ),
  );
  for (const row of rows) {
    if (row.cardId === null || row.kind === 'review.annulled') {
      continue;
    }
    if (row.kind === 'review.graded') {
      if (!annulled.has(row.id)) {
        states.set(row.cardId, NONE);
      }
      continue;
    }
    const payload = readPayload('review.postponed', row.version, row.payload);
    const before = states.get(row.cardId) ?? NONE;
    // «Más tarde hoy» (la fecha planificada es el mismo día) se registra pero no cuenta para el
    // tope de 3: posponer es mandarla a otro día.
    const toAnotherDay = payload.plannedDay > studyDayOf(new Date(row.at));
    states.set(row.cardId, {
      count: before.count + (toAnotherDay ? 1 : 0),
      plannedDay: payload.plannedDay,
    });
  }
  return states;
}

// La fecha planificada vigente de una tarjeta (para guardarla junto al repaso real).
export function plannedDayOf(db: Writer, cardId: string): string | null {
  return postponementStates(db, [cardId]).get(cardId)?.plannedDay ?? null;
}

// Registra el aplazamiento de una tarjeta. El mismo pedido dos veces no agrega nada.
export function appendPostponement(
  tx: Writer,
  clock: Clock,
  input: {
    cardId: string;
    suggestedDay: string;
    plannedDay: string;
    reason: 'shortDay' | 'noFit' | 'manual';
    sessionId?: string;
    idempotencyKey: string;
  },
): void {
  const { idempotencyKey, sessionId, ...payload } = input;
  appendObservation(tx, clock, {
    kind: 'review.postponed',
    payload: sessionId === undefined ? payload : { ...payload, sessionId },
    idempotencyKey,
    source: 'user',
  });
}

// Las veces que se pospuso una tarjeta, para mostrarlas en su historial.
export function postponementsOf(
  db: Writer,
  cardId: string,
): { id: string; seq: number; occurredAt: Date; plannedDay: string }[] {
  return db
    .select({
      id: observations.id,
      seq: observations.seq,
      at: observations.occurredAt,
      payload: observations.payload,
      version: observations.schemaVersion,
    })
    .from(observations)
    .where(and(eq(observations.cardId, cardId), eq(observations.kind, 'review.postponed')))
    .orderBy(observations.seq)
    .all()
    .map((row) => ({
      id: row.id,
      seq: row.seq,
      occurredAt: new Date(row.at),
      plannedDay: readPayload('review.postponed', row.version, row.payload).plannedDay,
    }));
}

// Los aplazamientos que ya se registraron con este pedido (nada si es la primera vez): el mismo
// pedido dos veces no agrega nada.
export function recordedPostponements(
  db: Writer,
  requestId: string,
): { count: number; plannedDay: string } | null {
  const rows = db
    .select({ payload: observations.payload, version: observations.schemaVersion })
    .from(observations)
    .where(like(observations.idempotencyKey, `postpone:${requestId}:%`))
    .all();
  const first = rows[0];
  if (first === undefined) {
    return null;
  }
  return {
    count: rows.length,
    plannedDay: readPayload('review.postponed', first.version, first.payload).plannedDay,
  };
}
