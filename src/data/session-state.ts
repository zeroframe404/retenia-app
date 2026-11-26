import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  isOpenSession,
  projectSession,
  type SessionEvent,
  type SessionState,
} from '../core/session';
import { readPayload } from './ledger';
import type { Writer } from './orm';
import { observations } from './schema';

// Cómo está una sesión de estudio: la proyección de sus eventos del libro mayor. Aparte de
// `study.ts` porque también la miran los ejercicios y los procedimientos, que solo aceptan un envío
// «desde la sesión» si es de la actividad que la sesión está mostrando.

class SessionNotFoundError extends Error {
  constructor() {
    super('No encontré esa sesión');
    this.name = 'SessionNotFoundError';
  }
}

class NotTheSessionActivityError extends Error {
  constructor() {
    super('Eso no es lo que la sesión está mostrando');
    this.name = 'NotTheSessionActivityError';
  }
}

type ObservationRow = typeof observations.$inferSelect;

function sessionEventOf(row: ObservationRow): SessionEvent | null {
  switch (row.kind) {
    case 'session.started': {
      const p = readPayload('session.started', row.schemaVersion, row.payload);
      return { kind: 'started', ...p };
    }
    case 'review.graded': {
      const p = readPayload('review.graded', row.schemaVersion, row.payload);
      if (!('activityId' in p) || p.activityId === undefined) {
        return null;
      }
      return {
        kind: 'graded',
        reviewId: row.id,
        activityId: p.activityId,
        grade: p.grade,
        retryActivityId: p.retryActivityId ?? null,
        activeMs: p.activeMs ?? 0,
      };
    }
    case 'review.annulled': {
      const p = readPayload('review.annulled', row.schemaVersion, row.payload);
      return {
        kind: 'annulled',
        reviewId: p.reviewId,
        activeMs: 'activeMs' in p ? (p.activeMs ?? 0) : 0,
      };
    }
    case 'card.flagged': {
      const p = readPayload('card.flagged', row.schemaVersion, row.payload);
      return { kind: 'flagged', activityId: p.activityId, activeMs: p.activeMs };
    }
    case 'session.skipped': {
      const p = readPayload('session.skipped', row.schemaVersion, row.payload);
      return { kind: 'skipped', activityId: p.activityId, activeMs: p.activeMs };
    }
    case 'session.dropped': {
      const p = readPayload('session.dropped', row.schemaVersion, row.payload);
      return { kind: 'dropped', activityId: p.activityId, activeMs: p.activeMs };
    }
    case 'session.exercise_done': {
      const p = readPayload('session.exercise_done', row.schemaVersion, row.payload);
      return {
        kind: 'exercise',
        activityId: p.activityId,
        outcome: p.outcome,
        activeMs: p.activeMs,
      };
    }
    case 'session.paused':
    case 'session.resumed':
    case 'session.finished':
    case 'session.abandoned': {
      const p = readPayload(row.kind, row.schemaVersion, row.payload);
      const kind = row.kind.slice('session.'.length) as
        | 'paused'
        | 'resumed'
        | 'finished'
        | 'abandoned';
      return { kind, activeMs: p.activeMs };
    }
    default:
      return null;
  }
}

export function sessionRows(db: Writer, sessionId: string): ObservationRow[] {
  return db
    .select()
    .from(observations)
    .where(eq(observations.sessionId, sessionId))
    .orderBy(observations.seq)
    .all();
}

export function stateOf(db: Writer, sessionId: string): SessionState {
  const events = sessionRows(db, sessionId).flatMap((row) => {
    const event = sessionEventOf(row);
    return event === null ? [] : [event];
  });
  if (events[0]?.kind !== 'started') {
    throw new SessionNotFoundError();
  }
  return projectSession(events);
}

// Un envío que dice salir de una sesión tiene que ser de la tarjeta que esa sesión está mostrando.
export function assertSessionActivity(db: Writer, sessionId: string, cardId: string): void {
  const state = stateOf(db, sessionId);
  if (!isOpenSession(state) || state.pending[0]?.cardId !== cardId) {
    throw new NotTheSessionActivityError();
  }
}

// Lo que enviaste de una tarjeta desde esa sesión, en orden: los intentos y, de un procedimiento,
// los ejemplos que terminaste. Lo hecho por fuera («Practicar ahora») no entra.
export function sentFromSession(db: Writer, sessionId: string, cardId: string) {
  return db
    .select({
      id: observations.id,
      kind: observations.kind,
      payload: observations.payload,
      schemaVersion: observations.schemaVersion,
      key: observations.idempotencyKey,
    })
    .from(observations)
    .where(
      and(
        eq(observations.cardId, cardId),
        inArray(observations.kind, ['attempt.submitted', 'procedure.studied']),
        sql`json_extract(${observations.payload}, '$.studySessionId') = ${sessionId}`,
      ),
    )
    .orderBy(observations.seq)
    .all();
}
