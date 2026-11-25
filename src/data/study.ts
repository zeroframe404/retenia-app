import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../core/clock';
import type { HelpUse } from '../core/evaluation';
import { LOAD_POLICY_VERSION, postponeOutcome } from '../core/load';
import type { Grade } from '../core/memory';
import {
  activeMinutes,
  chooseSessionCards,
  projectSession,
  type SessionEvent,
  type SessionState,
  summarizeSession,
} from '../core/session';
import { studyDayOf } from '../core/study-day';
import type {
  PlanOption,
  PostponeResult,
  SessionFocus,
  SessionMinutes,
  SessionRating,
  SessionSummary,
  SessionView,
  StudyOverview,
} from '../preload/contract/study';
import { annulReview, type CardsStore, flagCardVersion, recordReview } from './cards';
import type { ReteniaDatabase } from './database';
import { newId } from './ids';
import { appendObservation, readPayload } from './ledger';
import {
  composeFor,
  gather,
  holdNewCardsToday,
  inactivityCapMs,
  proposalFrom,
  reviewsToOffer,
  writeDefaultMinutes,
} from './load';
import type { Writer } from './orm';
import { appendPostponement, postponementStates, recordedPostponements } from './postponements';
import { cards, cardVersions, observations, sessionDrafts, subjects, topics } from './schema';
import { readSetting, writeSetting } from './settings';
import { eligibleCards, nextDay, OUT_OF_REVIEWS, studiedGroupsOf } from './study-queue';

// La sesión de estudio (Fase 10, H-16 a H-18). La sesión no se guarda como una fila que se pisa:
// es la proyección de sus eventos en el libro mayor (empezó, cada repaso, deshacer, saltar, marcar,
// pausar, retomar, terminar), que se recalcula al leerla con la función pura de `core/session`.
// Cada escritura agrega un solo evento (o un repaso con su evaluación y su agenda) en una sola
// transacción: un corte deja el paso entero o ausente, y un pedido repetido no agrega nada. Lo que
// no es historia (el borrador de «Tu respuesta…», las preferencias) vive en tablas aparte.

class NothingToStudyError extends Error {
  constructor() {
    super('Hoy no hay repasos vencidos para armar una sesión');
    this.name = 'NothingToStudyError';
  }
}

class SessionNotFoundError extends Error {
  constructor() {
    super('No encontré esa sesión');
    this.name = 'SessionNotFoundError';
  }
}

class SessionClosedError extends Error {
  constructor() {
    super('La sesión ya terminó');
    this.name = 'SessionClosedError';
  }
}

// Los tiempos de un intento (los mide el principal): cuándo se mostró la tarjeta y a los cuántos
// milisegundos hubo la primera interacción, se pidió la respuesta y se calificó.
export interface AttemptMarks {
  shownAt: Date | null;
  firstInteractionMs: number | null;
  answerRequestedMs: number | null;
  gradedMs: number | null;
}

interface PlanPreferences {
  shorter: boolean;
  morePracticeTopicIds: string[];
  pausedTopicIds: string[];
}

export interface StudyStore {
  // La propuesta de hoy para esos minutos (los de siempre si no se dice): no guarda nada de lo elegido.
  overview(input?: { minutes?: SessionMinutes | undefined }): StudyOverview;
  start(input: {
    sessionId: string;
    minutes?: SessionMinutes | undefined;
    only?: SessionFocus | undefined;
    activeMs?: number;
  }): SessionView;
  // «Posponer»: cada repaso de la propuesta queda aplazado (sin calificarse). A la cuarta vez que se
  // pospone una tarjeta no se pospone: pasa a prioridad máxima y entra sí o sí.
  postpone(input: {
    requestId: string;
    minutes?: SessionMinutes | undefined;
    when: 'later' | 'tomorrow' | 'day';
    day?: string | undefined;
  }): PostponeResult;
  // El tiempo de siempre (25 minutos hasta que «Mi meta» lo cambie): lo usa la propuesta.
  setDefaultMinutes(minutes: SessionMinutes): void;
  // El corte de inactividad de cada paso de una sesión, en milisegundos.
  inactivityCapMs(): number;
  view(input: { sessionId: string }): SessionView;
  resume(input: { sessionId: string; activeMs?: number }): SessionView;
  grade(input: {
    sessionId: string;
    activityId: string;
    attemptId: string;
    grade: Grade;
    answer: string | null;
    marks?: AttemptMarks;
    activeMs?: number;
    // Fase 16: la ayuda usada en esa tarjeta y si se tocó «No sé por dónde empezar».
    help?: readonly HelpUse[] | undefined;
    noIdea?: boolean | undefined;
  }): SessionView;
  // Deshace la calificación de esa actividad si es la última: el mismo pedido dos veces deshace una.
  undo(input: { sessionId: string; activityId: string; activeMs?: number }): SessionView;
  skip(input: { sessionId: string; activityId: string; activeMs?: number }): SessionView;
  flag(input: {
    sessionId: string;
    activityId: string;
    attemptId: string;
    activeMs?: number;
  }): SessionView;
  pause(input: { sessionId: string; activeMs?: number }): void;
  // Al cerrar la ventana: pausa la sesión de hoy que esté en curso, si hay.
  pauseOpen(activeMs?: number): void;
  saveDraft(input: {
    sessionId: string;
    activityId: string;
    text: string;
    answerShown: boolean;
  }): void;
  summary(input: { sessionId: string }): SessionSummary;
  rate(input: { sessionId: string; rating: SessionRating; ratingId: string }): void;
  adjustPlan(input: { sessionId: string; option: PlanOption }): void;
  planPreferences(): PlanPreferences;
  dismissShortcuts(): void;
}

const SHORTCUTS_SEEN = 'session.shortcutsSeen';
const PLAN_PREFERENCES = 'plan.preferences';
const planSchema = z.object({
  shorter: z.boolean(),
  morePracticeTopicIds: z.array(z.string()),
  pausedTopicIds: z.array(z.string()),
});
const NO_PREFERENCES: PlanPreferences = {
  shorter: false,
  morePracticeTopicIds: [],
  pausedTopicIds: [],
};

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

function sessionRows(db: Writer, sessionId: string): ObservationRow[] {
  return db
    .select()
    .from(observations)
    .where(eq(observations.sessionId, sessionId))
    .orderBy(observations.seq)
    .all();
}

function stateOf(db: Writer, sessionId: string): SessionState {
  const events = sessionRows(db, sessionId).flatMap((row) => {
    const event = sessionEventOf(row);
    return event === null ? [] : [event];
  });
  if (events[0]?.kind !== 'started') {
    throw new SessionNotFoundError();
  }
  return projectSession(events);
}

const isOpen = (state: SessionState) =>
  (state.status === 'active' || state.status === 'paused') && !state.complete;

// La última sesión empezada este día de estudio.
function latestSessionOf(db: Writer, today: string): string | null {
  const rows = db
    .select({ payload: observations.payload, version: observations.schemaVersion })
    .from(observations)
    .where(eq(observations.kind, 'session.started'))
    .orderBy(desc(observations.seq))
    .limit(20)
    .all();
  for (const row of rows) {
    const started = readPayload('session.started', row.version, row.payload);
    if (started.studyDay === today) {
      return started.sessionId;
    }
  }
  return null;
}

export function createStudyStore(
  db: ReteniaDatabase,
  clock: Clock,
  cardsStore: () => CardsStore,
  { fuzz = false }: { fuzz?: boolean } = {},
): StudyStore {
  const { orm } = db;
  const today = () => studyDayOf(clock.now());

  function append(
    tx: Writer,
    kind:
      | 'session.skipped'
      | 'session.dropped'
      | 'session.paused'
      | 'session.resumed'
      | 'session.finished'
      | 'session.abandoned',
    payload: { sessionId: string; activityId?: string; activeMs: number },
    idempotencyKey: string,
  ): void {
    const { activityId, ...step } = payload;
    if (kind === 'session.skipped' || kind === 'session.dropped') {
      appendObservation(tx, clock, {
        kind,
        payload: { ...step, activityId: activityId ?? '' },
        idempotencyKey,
        source: 'user',
      });
    } else {
      appendObservation(tx, clock, { kind, payload: step, idempotencyKey, source: 'user' });
    }
  }

  // Si la sesión quedó sin actividades pendientes y todavía no terminó, termina.
  function finishIfComplete(tx: Writer, sessionId: string): void {
    const state = stateOf(tx, sessionId);
    if (state.complete && (state.status === 'active' || state.status === 'paused')) {
      // Puede terminar más de una vez: deshacer la última la vuelve a abrir.
      append(tx, 'session.finished', { sessionId, activeMs: 0 }, `finish:${newId()}`);
    }
  }

  // La actividad actual tiene que ser una tarjeta que todavía se puede estudiar; si se borró, se
  // pausó o su ficha pasó a «En revisión» o «Retirada» (desde «Editar» o desde Apuntes), sale de
  // la sesión como hecha.
  function dropUnavailable(tx: Writer, sessionId: string): void {
    for (;;) {
      const state = stateOf(tx, sessionId);
      const current = state.pending[0];
      if (!current || !isOpen(state)) {
        return;
      }
      const row = tx
        .select({
          deletedAt: cards.deletedAt,
          pausedAt: cards.pausedAt,
          sheetState: cardVersions.sheetState,
        })
        .from(cards)
        .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
        .where(eq(cards.id, current.cardId))
        .get();
      const available =
        row !== undefined &&
        row.deletedAt === null &&
        row.pausedAt === null &&
        !OUT_OF_REVIEWS.includes(row.sheetState);
      if (available) {
        return;
      }
      append(
        tx,
        'session.dropped',
        { sessionId, activityId: current.activityId, activeMs: 0 },
        `drop:${sessionId}:${current.activityId}`,
      );
      finishIfComplete(tx, sessionId);
    }
  }

  function viewOf(tx: Writer, sessionId: string): SessionView {
    const state = stateOf(tx, sessionId);
    const pending = state.pending[0];
    let current: SessionView['current'] = null;
    if (pending && isOpen(state)) {
      const draft = tx
        .select({ text: sessionDrafts.text, answerShown: sessionDrafts.answerShown })
        .from(sessionDrafts)
        .where(
          and(
            eq(sessionDrafts.sessionId, sessionId),
            eq(sessionDrafts.activityId, pending.activityId),
          ),
        )
        .get();
      current = {
        activityId: pending.activityId,
        cardId: pending.cardId,
        retry: pending.retry,
        card: cardsStore().get({ cardId: pending.cardId }),
        draft: { text: draft?.text ?? '', answerShown: (draft?.answerShown ?? 0) === 1 },
      };
    }
    return {
      sessionId,
      status: state.status,
      progress: state.progress,
      complete: state.complete,
      current,
      undoable:
        state.undoable && (isOpen(state) || state.status === 'finished')
          ? { activityId: state.undoable.activityId, grade: state.undoable.grade }
          : null,
      showShortcuts: !readSetting(tx, SHORTCUTS_SEEN, z.boolean(), false),
    };
  }

  // Lo que cambia la sesión: corre en una transacción, saca antes la actividad actual si ya no se
  // puede estudiar y devuelve cómo quedó.
  function change(sessionId: string, write: (tx: Writer, state: SessionState) => void) {
    return orm.transaction((tx) => {
      dropUnavailable(tx, sessionId);
      write(tx, stateOf(tx, sessionId));
      return viewOf(tx, sessionId);
    });
  }

  function overviewOf(tx: Writer, minutes: SessionMinutes | undefined): StudyOverview {
    const gathered = gather(tx, clock, { recordBacklog: true });
    const subject = gathered?.subject;
    const day = today();
    const sessionId = latestSessionOf(tx, day);
    let resumable: StudyOverview['resumable'] = null;
    if (sessionId !== null) {
      const state = stateOf(tx, sessionId);
      if (isOpen(state)) {
        resumable = { sessionId, done: state.progress.done, total: state.progress.total };
      }
    }
    const dueCount =
      gathered === null
        ? 0
        : chooseSessionCards(gathered.reviews, {
            size: Number.POSITIVE_INFINITY,
            studiedGroups: gathered.studiedGroups,
          }).chosen.length;
    return {
      subjectId: subject?.id ?? null,
      subjectName: subject?.name ?? null,
      dueCount,
      proposal: gathered === null ? null : proposalFrom(tx, gathered, minutes),
      resumable,
    };
  }

  function preferences(tx: Writer): PlanPreferences {
    return readSetting(tx, PLAN_PREFERENCES, planSchema, NO_PREFERENCES);
  }

  function summaryOf(tx: Writer, sessionId: string): SessionSummary {
    const state = stateOf(tx, sessionId);
    const rows = sessionRows(tx, sessionId);
    const started = rows.find((row) => row.kind === 'session.started');
    const order = started
      ? readPayload('session.started', started.schemaVersion, started.payload).activities.map(
          (activity) => activity.cardId,
        )
      : [];
    const info = new Map(
      order.length === 0
        ? []
        : tx
            .select({
              cardId: cards.id,
              question: cardVersions.question,
              topicId: topics.id,
              topicName: topics.name,
            })
            .from(cards)
            .innerJoin(cardVersions, eq(cardVersions.id, cards.currentVersionId))
            .leftJoin(topics, and(eq(topics.id, cards.topicId), isNull(topics.deletedAt)))
            .where(inArray(cards.id, order))
            .all()
            .map((row) => [row.cardId, row]),
    );
    const summary = summarizeSession(
      state,
      new Map(
        [...info].map(([cardId, row]) => [
          cardId,
          { question: row.question, topicName: row.topicName },
        ]),
      ),
    );
    const subject = tx
      .select({ name: subjects.name })
      .from(subjects)
      .where(eq(subjects.id, state.subjectId))
      .get();
    const day = today();
    const candidates = eligibleCards(tx, state.subjectId, day);
    const remainingDueToday = chooseSessionCards(reviewsToOffer(tx, state.subjectId, day).offered, {
      size: Number.POSITIVE_INFINITY,
      studiedGroups: studiedGroupsOf(tx, day),
    }).chosen.length;
    const tomorrow = nextDay(day);
    // Mañana vuelve lo que vence mañana y lo que se aplazó para mañana por no caber.
    const planned = postponementStates(
      tx,
      candidates.map((card) => card.cardId),
    );
    const dueTomorrow = candidates.filter((card) => {
      const day = planned.get(card.cardId)?.plannedDay;
      return (day != null && day > card.dueDay ? day : card.dueDay) === tomorrow;
    }).length;
    const rated = [...rows].reverse().find((row) => row.kind === 'session.rated');
    const focus = [...info.values()].find(
      (row) => row.topicId !== null && row.topicName === summary.focusTopicName,
    );
    return {
      sessionId,
      subjectName: subject?.name ?? null,
      minutes: activeMinutes(state.activeMs),
      results: summary.results,
      difficulties: summary.difficulties.map((difficulty) => ({
        topicName: difficulty.topicName,
        cardIds: [...difficulty.cardIds],
        questions: [...difficulty.questions],
      })),
      remainingDueToday,
      dueTomorrow,
      rating: rated
        ? readPayload('session.rated', rated.schemaVersion, rated.payload).rating
        : null,
      cards: [...new Set(order)].flatMap((cardId) => {
        const row = info.get(cardId);
        return row ? [{ cardId, question: row.question }] : [];
      }),
      focusTopic:
        focus?.topicId && focus.topicName ? { id: focus.topicId, name: focus.topicName } : null,
    };
  }

  return {
    overview(input = {}) {
      return orm.transaction((tx) => overviewOf(tx, input.minutes));
    },

    setDefaultMinutes(minutes) {
      writeDefaultMinutes(orm, clock, minutes);
    },

    inactivityCapMs() {
      return inactivityCapMs(orm, clock);
    },

    postpone({ requestId, minutes, when, day: chosenDay }) {
      return orm.transaction((tx) => {
        const recorded = recordedPostponements(tx, requestId);
        if (recorded !== null) {
          return { postponed: recorded.count, forced: 0, plannedDay: recorded.plannedDay };
        }
        const gathered = gather(tx, clock, { recordBacklog: false });
        if (gathered === null) {
          throw new NothingToStudyError();
        }
        const tomorrow = nextDay(gathered.today);
        const plannedDay =
          when === 'later'
            ? gathered.today
            : when === 'tomorrow' || chosenDay === undefined || chosenDay < tomorrow
              ? tomorrow
              : chosenDay;
        const plan = composeFor(gathered, minutes ?? gathered.defaultMinutes);
        const offered = new Map(gathered.reviews.map((card) => [card.cardId, card]));
        let postponed = 0;
        let forced = 0;
        for (const cardId of plan.reviews) {
          const card = offered.get(cardId);
          if (postponeOutcome(card?.postponements ?? 0) === 'maxPriority') {
            forced += 1;
            continue;
          }
          appendPostponement(tx, clock, {
            cardId,
            suggestedDay: card?.dueDay ?? gathered.today,
            plannedDay,
            reason: 'manual',
            idempotencyKey: `postpone:${requestId}:${cardId}`,
          });
          postponed += 1;
        }
        if (when !== 'later') {
          // Pospuso la sesión de hoy para otro día: hoy no se agregan tarjetas nuevas y la sesión
          // a medias, que tenía esos repasos, se deja.
          holdNewCardsToday(tx, clock, gathered.today);
          const open = latestSessionOf(tx, gathered.today);
          if (open !== null && isOpen(stateOf(tx, open))) {
            append(tx, 'session.abandoned', { sessionId: open, activeMs: 0 }, `abandon:${open}`);
          }
        }
        return { postponed, forced, plannedDay };
      });
    },

    start({ sessionId, minutes, only, activeMs = 0 }) {
      return orm.transaction((tx) => {
        const exists = tx
          .select({ id: observations.id })
          .from(observations)
          .where(eq(observations.idempotencyKey, `session:${sessionId}`))
          .get();
        if (exists) {
          return viewOf(tx, sessionId);
        }
        const gathered = gather(tx, clock, { recordBacklog: false });
        if (gathered === null) {
          throw new NothingToStudyError();
        }
        const subject = gathered.subject;
        const day = gathered.today;
        const chosenMinutes = minutes ?? gathered.defaultMinutes;
        const plan = composeFor(gathered, chosenMinutes, only);
        const chosen = [...plan.reviews, ...plan.newCards];
        if (chosen.length === 0) {
          throw new NothingToStudyError();
        }
        const previous = latestSessionOf(tx, day);
        if (previous !== null && isOpen(stateOf(tx, previous))) {
          append(
            tx,
            'session.abandoned',
            { sessionId: previous, activeMs: 0 },
            `abandon:${previous}`,
          );
        }
        appendObservation(tx, clock, {
          kind: 'session.started',
          payload: {
            sessionId,
            subjectId: subject.id,
            studyDay: day,
            activities: chosen.map((cardId) => ({ activityId: newId(), cardId })),
            deferredSiblingIds: [...plan.deferredSiblings],
            activeMs,
            minutes: chosenMinutes,
            loadPolicyVersion: LOAD_POLICY_VERSION,
          },
          idempotencyKey: `session:${sessionId}`,
          source: 'user',
        });
        // Lo que no entró queda para mañana, sin calificarse.
        const tomorrow = nextDay(day);
        const offered = new Map(gathered.reviews.map((card) => [card.cardId, card]));
        for (const { cardId } of plan.postponed) {
          appendPostponement(tx, clock, {
            cardId,
            suggestedDay: offered.get(cardId)?.dueDay ?? day,
            plannedDay: tomorrow,
            reason: 'noFit',
            sessionId,
            idempotencyKey: `postpone:${sessionId}:${cardId}`,
          });
        }
        return viewOf(tx, sessionId);
      });
    },

    view({ sessionId }) {
      return change(sessionId, () => {});
    },

    resume({ sessionId, activeMs = 0 }) {
      return change(sessionId, (tx, state) => {
        // Una sesión pausada vale hasta el cambio de día de estudio (04:00).
        if (state.studyDay !== today()) {
          throw new SessionClosedError();
        }
        if (state.status === 'paused' && !state.complete) {
          append(tx, 'session.resumed', { sessionId, activeMs }, `resume:${newId()}`);
        }
      });
    },

    grade({ sessionId, activityId, attemptId, grade, answer, marks, activeMs = 0, help, noIdea }) {
      return change(sessionId, (tx, state) => {
        const current = state.pending[0];
        if (!isOpen(state) || current?.activityId !== activityId) {
          return;
        }
        const recorded = recordReview(tx, clock, fuzz, {
          cardId: current.cardId,
          grade,
          attemptId,
          help,
          noIdea,
          session: {
            sessionId,
            activityId,
            retry: current.retry,
            retryActivityId: grade === 'again' && !current.retry ? newId() : null,
            answer: answer === null || answer.trim() === '' ? null : answer,
            shownAt: marks?.shownAt ? marks.shownAt.toISOString() : null,
            firstInteractionMs: marks?.firstInteractionMs ?? null,
            answerRequestedMs: marks?.answerRequestedMs ?? null,
            gradedMs: marks?.gradedMs ?? null,
            activeMs,
          },
        });
        if (recorded.inserted) {
          finishIfComplete(tx, sessionId);
        }
      });
    },

    undo({ sessionId, activityId, activeMs = 0 }) {
      return orm.transaction((tx) => {
        const state = stateOf(tx, sessionId);
        if (state.status === 'abandoned') {
          throw new SessionClosedError();
        }
        const last = state.undoable;
        if (last?.activityId === activityId) {
          annulReview(tx, clock, {
            cardId: last.cardId,
            reviewId: last.reviewId,
            sessionId,
            activeMs,
          });
          const undone = state.done.at(-1);
          if (undone) {
            tx.update(sessionDrafts)
              .set({ answerShown: 0 })
              .where(
                and(
                  eq(sessionDrafts.sessionId, sessionId),
                  eq(sessionDrafts.activityId, undone.activityId),
                ),
              )
              .run();
          }
        }
        return viewOf(tx, sessionId);
      });
    },

    skip({ sessionId, activityId, activeMs = 0 }) {
      return change(sessionId, (tx, state) => {
        if (isOpen(state) && state.pending[0]?.activityId === activityId) {
          append(tx, 'session.skipped', { sessionId, activityId, activeMs }, `skip:${newId()}`);
        }
      });
    },

    flag({ sessionId, activityId, attemptId, activeMs = 0 }) {
      return change(sessionId, (tx, state) => {
        const current = state.pending[0];
        if (!isOpen(state) || current?.activityId !== activityId) {
          return;
        }
        const versionId = flagCardVersion(tx, clock, current.cardId);
        appendObservation(tx, clock, {
          kind: 'card.flagged',
          payload: {
            cardId: current.cardId,
            sessionId,
            activityId,
            attemptId,
            versionId,
            activeMs,
          },
          idempotencyKey: `flag:${attemptId}`,
          source: 'user',
        });
        finishIfComplete(tx, sessionId);
      });
    },

    pause({ sessionId, activeMs = 0 }) {
      orm.transaction((tx) => {
        const state = stateOf(tx, sessionId);
        if (state.status === 'active' && !state.complete) {
          append(tx, 'session.paused', { sessionId, activeMs }, `pause:${newId()}`);
        }
      });
    },

    pauseOpen(activeMs = 0) {
      orm.transaction((tx) => {
        const sessionId = latestSessionOf(tx, today());
        if (sessionId === null) {
          return;
        }
        const state = stateOf(tx, sessionId);
        if (state.status === 'active' && !state.complete) {
          append(tx, 'session.paused', { sessionId, activeMs }, `pause:${newId()}`);
        }
      });
    },

    saveDraft({ sessionId, activityId, text, answerShown }) {
      const values = {
        sessionId,
        activityId,
        text,
        answerShown: answerShown ? 1 : 0,
        updatedAt: clock.now().toISOString(),
      };
      orm
        .insert(sessionDrafts)
        .values(values)
        .onConflictDoUpdate({
          target: [sessionDrafts.sessionId, sessionDrafts.activityId],
          set: { text, answerShown: values.answerShown, updatedAt: values.updatedAt },
        })
        .run();
    },

    summary({ sessionId }) {
      return orm.transaction((tx) => summaryOf(tx, sessionId));
    },

    rate({ sessionId, rating, ratingId }) {
      orm.transaction((tx) => {
        stateOf(tx, sessionId);
        appendObservation(tx, clock, {
          kind: 'session.rated',
          payload: { sessionId, rating },
          idempotencyKey: `rate:${ratingId}`,
          source: 'user',
        });
      });
    },

    adjustPlan({ sessionId, option }) {
      orm.transaction((tx) => {
        const current = preferences(tx);
        const topicId = summaryOf(tx, sessionId).focusTopic?.id ?? null;
        const add = (list: string[]) =>
          topicId === null || list.includes(topicId) ? list : [...list, topicId];
        const next: PlanPreferences =
          option === 'shorter'
            ? { ...current, shorter: true }
            : option === 'morePractice'
              ? { ...current, morePracticeTopicIds: add(current.morePracticeTopicIds) }
              : { ...current, pausedTopicIds: add(current.pausedTopicIds) };
        writeSetting(tx, clock, PLAN_PREFERENCES, next);
      });
    },

    planPreferences() {
      return preferences(orm);
    },

    dismissShortcuts() {
      writeSetting(orm, clock, SHORTCUTS_SEEN, true);
    },
  };
}
