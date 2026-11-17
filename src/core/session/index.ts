// La sesión de estudio (Fase 10): qué tarjetas entran, en qué orden, cuándo vuelve una fallada,
// qué hace «Deshacer» y qué dice el cierre. Reglas puras: sin base de datos ni pantalla.

import type { Grade } from '../memory/types';

// Cuántas tarjetas entran en una sesión (la composición por minutos llega en la Fase 11).
export const SESSION_SIZE = 10;
// Una tarjeta fallada vuelve después de al menos estas otras (o al final si quedan menos).
export const RETRY_GAP = 3;

export interface QueueCandidate {
  readonly cardId: string;
  readonly recall: number;
  readonly siblingGroupId: string | null;
  readonly dueDay: string;
}

interface SessionActivity {
  readonly activityId: string;
  readonly cardId: string;
  readonly retry: boolean;
}

type SessionOutcome = Grade | 'flagged' | 'dropped';

interface DoneActivity extends SessionActivity {
  readonly outcome: SessionOutcome;
  readonly reviewId: string | null;
  readonly retryActivityId: string | null;
}

type SessionStatus = 'active' | 'paused' | 'finished' | 'abandoned';

export interface SessionState {
  readonly sessionId: string;
  readonly subjectId: string;
  readonly studyDay: string;
  readonly status: SessionStatus;
  readonly pending: readonly SessionActivity[];
  readonly done: readonly DoneActivity[];
  readonly undoable: { reviewId: string; activityId: string; cardId: string; grade: Grade } | null;
  readonly progress: { done: number; total: number };
  readonly complete: boolean;
  readonly activeMs: number;
  readonly deferredSiblingIds: readonly string[];
}

export type SessionEvent =
  | {
      readonly kind: 'started';
      readonly sessionId: string;
      readonly subjectId: string;
      readonly studyDay: string;
      readonly activities: readonly { activityId: string; cardId: string }[];
      readonly deferredSiblingIds: readonly string[];
      readonly activeMs: number;
    }
  | {
      readonly kind: 'graded';
      readonly reviewId: string;
      readonly activityId: string;
      readonly grade: Grade;
      readonly retryActivityId: string | null;
      readonly activeMs: number;
    }
  | { readonly kind: 'annulled'; readonly reviewId: string; readonly activeMs: number }
  | { readonly kind: 'skipped'; readonly activityId: string; readonly activeMs: number }
  | { readonly kind: 'flagged'; readonly activityId: string; readonly activeMs: number }
  | { readonly kind: 'dropped'; readonly activityId: string; readonly activeMs: number }
  | {
      readonly kind: 'paused' | 'resumed' | 'finished' | 'abandoned';
      readonly activeMs: number;
    };

// Primero la de menor probabilidad de recordarla; a igual probabilidad, la que venció antes; y
// después el identificador, así el orden es siempre el mismo.
function compareCandidates(a: QueueCandidate, b: QueueCandidate): number {
  if (a.recall !== b.recall) {
    return a.recall - b.recall;
  }
  if (a.dueDay !== b.dueDay) {
    return a.dueDay < b.dueDay ? -1 : 1;
  }
  return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0;
}

// Las tarjetas de la sesión entre las vencidas que pueden entrar (quien llama ya sacó las pausadas,
// las «En revisión» y las que quedan fuera de la cola). De cada familia de hermanas entra una sola,
// la de menor probabilidad; las otras pasan a mañana. Si ya se estudió hoy una de la familia, no
// entra ninguna.
export function chooseSessionCards(
  candidates: readonly QueueCandidate[],
  options: { size?: number; studiedGroups?: ReadonlySet<string> } = {},
): { chosen: string[]; deferred: string[] } {
  const size = options.size ?? SESSION_SIZE;
  const studied = options.studiedGroups ?? new Set<string>();
  const sorted = [...candidates].sort(compareCandidates);
  const taken = new Set<string>();
  const eligible: QueueCandidate[] = [];
  const deferred: string[] = [];
  for (const card of sorted) {
    const group = card.siblingGroupId;
    if (group === null) {
      eligible.push(card);
    } else if (studied.has(group) || taken.has(group)) {
      deferred.push(card.cardId);
    } else {
      taken.add(group);
      eligible.push(card);
    }
  }
  return { chosen: eligible.slice(0, size).map((card) => card.cardId), deferred };
}

// Una tarjeta cuyas últimas 4 calificaciones fueron «No la sabía» sale de la cola (va a «Mejorar la
// tarjeta», que llega en la Fase 17).
const OUT_OF_QUEUE_FAILS = 4;
export function leftOutOfQueue(results: readonly Grade[]): boolean {
  return (
    results.length >= OUT_OF_QUEUE_FAILS &&
    results.slice(-OUT_OF_QUEUE_FAILS).every((result) => result === 'again')
  );
}

interface Draft {
  sessionId: string;
  subjectId: string;
  studyDay: string;
  status: SessionStatus;
  total: number;
  pending: SessionActivity[];
  done: DoneActivity[];
  activeMs: number;
  deferredSiblingIds: readonly string[];
  // «Saltar» corta la pila de deshacer: la última calificación ya no es lo último que pasó. Cada
  // calificación recuerda cómo estaba antes, así deshacerla deja todo como estaba.
  undoBlocked: boolean;
  blockedBefore: boolean[];
}

function applyEvent(draft: Draft, event: SessionEvent): void {
  draft.activeMs += event.activeMs;
  const current = draft.pending[0];
  switch (event.kind) {
    case 'started':
      return;
    case 'graded': {
      if (!current || current.activityId !== event.activityId) {
        return;
      }
      draft.pending.shift();
      draft.blockedBefore.push(draft.undoBlocked);
      draft.undoBlocked = false;
      const retryActivityId = current.retry ? null : event.retryActivityId;
      draft.done.push({
        ...current,
        outcome: event.grade,
        reviewId: event.reviewId,
        retryActivityId: event.grade === 'again' ? retryActivityId : null,
      });
      if (event.grade === 'again' && retryActivityId !== null) {
        const at = Math.min(RETRY_GAP, draft.pending.length);
        draft.pending.splice(at, 0, {
          activityId: retryActivityId,
          cardId: current.cardId,
          retry: true,
        });
      }
      return;
    }
    case 'annulled': {
      const last = draft.done.at(-1);
      if (!last || last.reviewId !== event.reviewId) {
        return;
      }
      draft.done.pop();
      draft.undoBlocked = draft.blockedBefore.pop() ?? false;
      // Deshacer la calificación que terminó la sesión la vuelve a abrir.
      if (draft.status === 'finished') {
        draft.status = 'active';
      }
      if (last.retryActivityId !== null) {
        draft.pending = draft.pending.filter(
          (activity) => activity.activityId !== last.retryActivityId,
        );
      }
      draft.pending.unshift({
        activityId: last.activityId,
        cardId: last.cardId,
        retry: last.retry,
      });
      return;
    }
    case 'skipped': {
      if (!current || current.activityId !== event.activityId) {
        return;
      }
      draft.pending.shift();
      draft.pending.push(current);
      draft.undoBlocked = true;
      return;
    }
    case 'flagged':
    case 'dropped': {
      if (!current || current.activityId !== event.activityId) {
        return;
      }
      draft.pending.shift();
      draft.done.push({
        ...current,
        outcome: event.kind,
        reviewId: null,
        retryActivityId: null,
      });
      return;
    }
    case 'paused':
      draft.status = 'paused';
      return;
    case 'resumed':
      draft.status = 'active';
      return;
    case 'finished':
      draft.status = 'finished';
      return;
    case 'abandoned':
      draft.status = 'abandoned';
      return;
  }
}

// La sesión como proyección de sus eventos (en el orden en que se guardaron). Un evento que no
// corresponde a la actividad actual (un pedido viejo o repetido) no cambia nada.
export function projectSession(events: readonly SessionEvent[]): SessionState {
  const first = events[0];
  if (first?.kind !== 'started') {
    throw new Error('Una sesión empieza con su evento de inicio');
  }
  const draft: Draft = {
    sessionId: first.sessionId,
    subjectId: first.subjectId,
    studyDay: first.studyDay,
    status: 'active',
    total: first.activities.length,
    pending: first.activities.map((activity) => ({ ...activity, retry: false })),
    done: [],
    activeMs: 0,
    deferredSiblingIds: first.deferredSiblingIds,
    undoBlocked: false,
    blockedBefore: [],
  };
  for (const event of events) {
    applyEvent(draft, event);
  }
  const last = draft.done.at(-1);
  const undoable =
    !draft.undoBlocked &&
    last &&
    last.reviewId !== null &&
    last.outcome !== 'flagged' &&
    last.outcome !== 'dropped'
      ? {
          reviewId: last.reviewId,
          activityId: last.activityId,
          cardId: last.cardId,
          grade: last.outcome,
        }
      : null;
  return {
    sessionId: draft.sessionId,
    subjectId: draft.subjectId,
    studyDay: draft.studyDay,
    status: draft.status,
    pending: draft.pending,
    done: draft.done,
    undoable,
    progress: { done: draft.done.filter((entry) => !entry.retry).length, total: draft.total },
    complete: draft.pending.length === 0,
    activeMs: draft.activeMs,
    deferredSiblingIds: draft.deferredSiblingIds,
  };
}

// «Sesión terminada · N min»: los minutos activos redondeados, nunca menos de 1.
export function activeMinutes(ms: number): number {
  return Math.max(1, Math.round(ms / 60_000));
}

export interface SessionSummary {
  readonly results: { good: number; hard: number; again: number; flagged: number };
  readonly difficulties: readonly {
    topicName: string | null;
    cardIds: readonly string[];
    questions: readonly string[];
  }[];
  readonly focusTopicName: string | null;
}

// Como máximo 2 dificultades en el cierre.
const MAX_DIFFICULTIES = 2;

// El cierre: cada tarjeta cuenta por su primera calificación (las vueltas no suman), las falladas
// agrupadas por tema (primero el tema con más; a igual cantidad, el que apareció antes), y el tema
// en que se enfoca «Ajustar el plan»: el de la primera dificultad o, sin dificultades, el que más
// tarjetas tuvo.
export function summarizeSession(
  state: SessionState,
  cards: ReadonlyMap<string, { question: string; topicName: string | null }>,
): SessionSummary {
  const results = { good: 0, hard: 0, again: 0, flagged: 0 };
  const failedByTopic = new Map<string | null, string[]>();
  const cardsByTopic = new Map<string | null, number>();
  for (const entry of state.done) {
    if (entry.retry || entry.outcome === 'dropped') {
      continue;
    }
    results[entry.outcome] += 1;
    const topic = cards.get(entry.cardId)?.topicName ?? null;
    if (entry.outcome === 'again') {
      failedByTopic.set(topic, [...(failedByTopic.get(topic) ?? []), entry.cardId]);
    }
  }
  const difficulties = [...failedByTopic.entries()]
    .map(([topicName, cardIds], order) => ({ topicName, cardIds, order }))
    .sort((a, b) => b.cardIds.length - a.cardIds.length || a.order - b.order)
    .slice(0, MAX_DIFFICULTIES)
    .map(({ topicName, cardIds }) => ({
      topicName,
      cardIds,
      questions: cardIds.map((cardId) => cards.get(cardId)?.question ?? ''),
    }));
  let focusTopicName: string | null = difficulties[0]?.topicName ?? null;
  if (difficulties.length === 0) {
    // Todas las tarjetas de la sesión (hechas o no), sin contar las vueltas.
    for (const activity of [...state.done, ...state.pending]) {
      if (!activity.retry) {
        const topic = cards.get(activity.cardId)?.topicName ?? null;
        cardsByTopic.set(topic, (cardsByTopic.get(topic) ?? 0) + 1);
      }
    }
    let most = 0;
    for (const [topic, count] of cardsByTopic) {
      if (count > most) {
        most = count;
        focusTopicName = topic;
      }
    }
  }
  return { results, difficulties, focusTopicName };
}
