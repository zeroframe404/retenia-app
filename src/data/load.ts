import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../core/clock';
import {
  type Attempt,
  type Brake,
  backlogDays,
  brakeWithRecovery,
  composeSession,
  durationLabel,
  INITIAL_SECONDS,
  inactivityCapSeconds,
  isLate,
  learnedEstimate,
  type ReviewCandidate,
  type SessionPlan,
} from '../core/load';
import { studyDayOf } from '../core/study-day';
import type {
  SessionFocus,
  SessionMinutes,
  StudyAlternative,
  StudyProposal,
} from '../preload/contract/study';
import { readPayload } from './ledger';
import type { Writer } from './orm';
import { postponementStates } from './postponements';
import { observations, topics } from './schema';
import { readSetting, writeSetting } from './settings';
import {
  activeSubject,
  DAY_MS,
  dueCandidates,
  type Eligible,
  newCardsOf,
  studiedGroupsOf,
} from './study-queue';

// La propuesta de estudio por minutos (Fase 11, H-19 a H-21): junta lo que hay (repasos vencidos,
// tarjetas nuevas, aplazamientos, cuánto tardás en cada cosa, cuánto estudiás por día), se lo da a
// las reglas puras de `core/load` y devuelve qué entra en una sesión de T minutos. Solo lee, salvo
// por anotar el atraso de cada día (para que el freno vuelva a 1 recién después de 3 días bajos).

const DEFAULT_MINUTES = 25;
const DEFAULT_MINUTES_KEY = 'study.defaultMinutes';
const BACKLOG_KEY = 'load.backlog';
const HOLD_NEW_KEY = 'load.holdNewDay';

const minutesSetting = z.union([z.literal(5), z.literal(10), z.literal(25), z.literal(45)]);
const backlogSetting = z.array(z.object({ day: z.string(), days: z.number() }));

// Cuántos días de atraso se guardan, y cuántos días de estudio cuentan para saber cuánto se
// estudia por día (con menos de 3 días con estudio todavía no hay historia).
const BACKLOG_DAYS_KEPT = 30;
const CAPACITY_WINDOW_DAYS = 14;
const MIN_STUDY_DAYS_FOR_CAPACITY = 3;
const ESTIMATE_WINDOW_DAYS = 60;

const defaultMinutesOf = (db: Writer): SessionMinutes =>
  readSetting(db, DEFAULT_MINUTES_KEY, minutesSetting, DEFAULT_MINUTES);

export function writeDefaultMinutes(db: Writer, clock: Clock, minutes: SessionMinutes): void {
  writeSetting(db, clock, DEFAULT_MINUTES_KEY, minutes);
}

// «No agrego tarjetas nuevas hoy»: lo pide quien pospone la sesión para otro día.
export function holdNewCardsToday(db: Writer, clock: Clock, today: string): void {
  writeSetting(db, clock, HOLD_NEW_KEY, today);
}

interface Attempts {
  review: Attempt[];
  newCard: Attempt[];
}

// Los intentos propios con tiempo medido (de las sesiones): los últimos 60 días, sin los anulados
// ni las vueltas de una fallada. Una tarjeta que se ve por primera vez es «nueva»; el resto, repaso.
function attemptsOf(db: Writer, clock: Clock): Attempts {
  const now = clock.now();
  const since = new Date(now.getTime() - ESTIMATE_WINDOW_DAYS * DAY_MS).toISOString();
  const rows = db
    .select({
      id: observations.id,
      at: observations.occurredAt,
      payload: observations.payload,
      version: observations.schemaVersion,
    })
    .from(observations)
    .where(
      and(
        eq(observations.kind, 'review.graded'),
        gt(observations.occurredAt, since),
        sql`json_extract(${observations.payload}, '$.gradedMs') is not null`,
      ),
    )
    .all();
  const result: Attempts = { review: [], newCard: [] };
  if (rows.length === 0) {
    return result;
  }
  const annulled = new Set(
    db
      .select({ payload: observations.payload, version: observations.schemaVersion })
      .from(observations)
      .where(eq(observations.kind, 'review.annulled'))
      .all()
      .map((row) => readPayload('review.annulled', row.version, row.payload).reviewId),
  );
  for (const row of rows) {
    if (annulled.has(row.id)) {
      continue;
    }
    const payload = readPayload('review.graded', row.version, row.payload);
    if (!('gradedMs' in payload) || payload.gradedMs === null || payload.gradedMs === undefined) {
      continue;
    }
    if ('retry' in payload && payload.retry === true) {
      continue;
    }
    const attempt: Attempt = {
      seconds: payload.gradedMs / 1000,
      daysAgo: Math.max(0, (now.getTime() - new Date(row.at).getTime()) / DAY_MS),
    };
    const first = 'elapsedDays' in payload && payload.elapsedDays === null;
    (first ? result.newCard : result.review).push(attempt);
  }
  return result;
}

export interface Estimates {
  readonly reviewSeconds: number;
  readonly ownReviewAttempts: number;
  readonly newCardSeconds: number;
}

export function estimatesOf(db: Writer, clock: Clock): Estimates {
  const attempts = attemptsOf(db, clock);
  const review = learnedEstimate(attempts.review, INITIAL_SECONDS.review);
  const fresh = learnedEstimate(attempts.newCard, INITIAL_SECONDS.newCard);
  return {
    reviewSeconds: review.estimateSeconds,
    ownReviewAttempts: review.count,
    newCardSeconds: fresh.estimateSeconds,
  };
}

// El corte de inactividad de cada paso de una sesión: como máximo el menor entre 3 veces la
// estimación de un repaso y 120 segundos.
export function inactivityCapMs(db: Writer, clock: Clock): number {
  return Math.round(inactivityCapSeconds(estimatesOf(db, clock).reviewSeconds) * 1000);
}

// Cuántos minutos se estudian por día: el promedio de los días con estudio de las últimas 2 semanas;
// sin historia (menos de 3 días con estudio), el tiempo de siempre.
function dailyMinutesOf(db: Writer, clock: Clock, fallback: number): number {
  const now = clock.now();
  const since = new Date(now.getTime() - CAPACITY_WINDOW_DAYS * DAY_MS).toISOString();
  const rows = db
    .select({
      at: observations.occurredAt,
      ms: sql<number>`json_extract(${observations.payload}, '$.activeMs')`,
    })
    .from(observations)
    .where(
      and(
        gt(observations.occurredAt, since),
        sql`json_extract(${observations.payload}, '$.activeMs') is not null`,
      ),
    )
    .all();
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const day = studyDayOf(new Date(row.at));
    byDay.set(day, (byDay.get(day) ?? 0) + Number(row.ms));
  }
  const studied = [...byDay.values()].filter((ms) => ms > 0);
  if (studied.length < MIN_STUDY_DAYS_FOR_CAPACITY) {
    return fallback;
  }
  const average = studied.reduce((sum, ms) => sum + ms, 0) / studied.length / 60_000;
  return Math.max(average, 1);
}

// El atraso de cada día de calendario hasta ayer: el de los días en que no se miró Estudiar es el
// último que se anotó (nada cambió que se sepa), así tres aperturas sueltas no cuentan como tres
// días seguidos.
function dailySeries(past: readonly { day: string; days: number }[], today: string): number[] {
  const series: number[] = [];
  const first = past[0];
  if (first === undefined) {
    return series;
  }
  const byDay = new Map(past.map((entry) => [entry.day, entry.days]));
  let last = first.days;
  const length = Math.min(daysBetween(first.day, today), 400);
  for (let offset = 0; offset < length; offset += 1) {
    const day = studyDayOf(new Date(Date.parse(`${first.day}T12:00:00-03:00`) + offset * DAY_MS));
    last = byDay.get(day) ?? last;
    series.push(last);
  }
  return series;
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

interface PlannedCandidate extends ReviewCandidate {
  readonly topicId: string | null;
}

export interface Gathered {
  readonly subject: { id: string; name: string };
  readonly today: string;
  readonly defaultMinutes: SessionMinutes;
  // Los repasos que se ofrecen hoy (los pospuestos para otro día no) y cuántos hay pospuestos.
  readonly reviews: readonly PlannedCandidate[];
  readonly postponedCount: number;
  readonly newCards: readonly {
    cardId: string;
    topicId: string | null;
    siblingGroupId: string | null;
  }[];
  readonly estimates: Estimates;
  readonly backlogDays: number;
  readonly brake: Brake;
  readonly studiedGroups: ReadonlySet<string>;
}

// Los repasos vencidos de la materia que se pueden ofrecer hoy, con lo que hace falta para
// ordenarlos, y cuántos quedan afuera por estar pospuestos para otro día.
export function reviewsToOffer(
  db: Writer,
  subjectId: string,
  today: string,
): { due: Eligible[]; offered: PlannedCandidate[]; postponedCount: number } {
  const due = dueCandidates(db, subjectId, today);
  const states = postponementStates(
    db,
    due.map((card) => card.cardId),
  );
  const offered: PlannedCandidate[] = [];
  let postponedCount = 0;
  for (const card of due) {
    const state = states.get(card.cardId);
    if (state?.plannedDay != null && state.plannedDay > today) {
      postponedCount += 1;
      continue;
    }
    offered.push({
      cardId: card.cardId,
      recall: card.recall,
      dueDay: card.dueDay,
      siblingGroupId: card.siblingGroupId,
      postponements: state?.count ?? 0,
      topicId: card.topicId,
    });
  }
  return { due, offered, postponedCount };
}

// Junta todo lo que hace falta para armar una sesión de hoy. Con `recordBacklog` también anota el
// atraso de hoy (una sola vez por valor): el freno usa los de los días anteriores.
export function gather(
  db: Writer,
  clock: Clock,
  { recordBacklog }: { recordBacklog: boolean },
): Gathered | null {
  const subject = activeSubject(db);
  if (subject === undefined) {
    return null;
  }
  const today = studyDayOf(clock.now());
  const defaultMinutes = defaultMinutesOf(db);
  const { due, offered, postponedCount } = reviewsToOffer(db, subject.id, today);
  const estimates = estimatesOf(db, clock);
  const late = due.filter((card) =>
    isLate({
      overdueDays: Math.max(0, daysBetween(card.dueDay, today)),
      intervalDays: Math.max(1, card.scheduledDays),
      recall: card.recall,
      targetRetention: card.retentionTarget,
    }),
  );
  const capacity = dailyMinutesOf(db, clock, defaultMinutes);
  const backlog = backlogDays((late.length * estimates.reviewSeconds) / 60, capacity);
  const past = readSetting(db, BACKLOG_KEY, backlogSetting, []).filter(
    (entry) => entry.day < today,
  );
  if (recordBacklog) {
    const next = [...past, { day: today, days: Math.round(backlog * 100) / 100 }].slice(
      -BACKLOG_DAYS_KEPT,
    );
    const current = readSetting(db, BACKLOG_KEY, backlogSetting, []);
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      writeSetting(db, clock, BACKLOG_KEY, next);
    }
  }
  const held = readSetting(db, HOLD_NEW_KEY, z.string().nullable(), null) === today;
  return {
    subject,
    today,
    defaultMinutes,
    reviews: offered,
    postponedCount,
    newCards: held ? [] : newCardsOf(db, subject.id),
    estimates,
    backlogDays: backlog,
    brake: brakeWithRecovery([...dailySeries(past, today).slice(-13), backlog]),
    studiedGroups: studiedGroupsOf(db, today),
  };
}

// Qué entra en una sesión de `minutes`, con una parte (solo repasos, solo nuevas o un tema) si se
// elige otra actividad.
export function composeFor(gathered: Gathered, minutes: number, only?: SessionFocus): SessionPlan {
  let reviews: readonly PlannedCandidate[] = gathered.reviews;
  let fresh = gathered.newCards;
  if (only?.kind === 'reviewsOnly') {
    fresh = [];
  } else if (only?.kind === 'newOnly') {
    reviews = [];
  } else if (only?.kind === 'topic') {
    reviews = reviews.filter((card) => card.topicId === only.topicId);
    fresh = fresh.filter((card) => card.topicId === only.topicId);
  }
  return composeSession({
    minutes,
    reviews,
    newCards: fresh.map((card) => card.cardId),
    newSiblingGroups: new Map(
      fresh.flatMap((card) =>
        card.siblingGroupId === null ? [] : [[card.cardId, card.siblingGroupId]],
      ),
    ),
    brake: gathered.brake,
    reviewSeconds: gathered.estimates.reviewSeconds,
    newCardSeconds: gathered.estimates.newCardSeconds,
    studiedGroups: gathered.studiedGroups,
  });
}

const shownMinutesOf = (plan: SessionPlan, ownAttempts: number) =>
  plan.estimatedSeconds === 0 ? 0 : durationLabel(plan.estimatedSeconds / 60, ownAttempts).minutes;

const MAX_ALTERNATIVES = 3;

function alternativesOf(
  db: Writer,
  gathered: Gathered,
  base: SessionPlan,
  minutes: number,
): StudyAlternative[] {
  const own = gathered.estimates.ownReviewAttempts;
  const list: StudyAlternative[] = [];
  const describe = (
    kind: StudyAlternative['kind'],
    plan: SessionPlan,
    topic: { id: string; name: string } | null,
  ): StudyAlternative => ({
    kind,
    topicId: topic?.id ?? null,
    topicName: topic?.name ?? null,
    reviews: plan.reviews.length,
    newCards: plan.newCards.length,
    shownMinutes: Math.max(5, shownMinutesOf(plan, own)),
  });
  // El tema con más repasos vencidos.
  const perTopic = new Map<string, number>();
  for (const card of gathered.reviews) {
    if (card.topicId !== null) {
      perTopic.set(card.topicId, (perTopic.get(card.topicId) ?? 0) + 1);
    }
  }
  const [topicId] =
    [...perTopic.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0] ?? [];
  if (topicId !== undefined && perTopic.size > 1) {
    const plan = composeFor(gathered, minutes, { kind: 'topic', topicId });
    const name = db
      .select({ name: topics.name })
      .from(topics)
      .where(inArray(topics.id, [topicId]))
      .get()?.name;
    if (
      name !== undefined &&
      plan.reviews.length > 0 &&
      plan.reviews.length < base.reviews.length
    ) {
      list.push(describe('topic', plan, { id: topicId, name }));
    }
  }
  if (base.newCards.length > 0 && base.reviews.length > 0) {
    list.push(
      describe('reviewsOnly', composeFor(gathered, minutes, { kind: 'reviewsOnly' }), null),
    );
  }
  if (base.reviews.length > 0) {
    const plan = composeFor(gathered, minutes, { kind: 'newOnly' });
    if (plan.newCards.length > 0) {
      list.push(describe('newOnly', plan, null));
    }
  }
  return list.slice(0, MAX_ALTERNATIVES);
}

// La propuesta de hoy para `minutes` (los de siempre si no se elige otro).
export function proposalFrom(
  db: Writer,
  gathered: Gathered,
  minutes: SessionMinutes | undefined,
): StudyProposal {
  const chosen = minutes ?? gathered.defaultMinutes;
  const plan = composeFor(gathered, chosen);
  return {
    minutes: chosen,
    defaultMinutes: gathered.defaultMinutes,
    reviews: plan.reviews.length,
    newCards: plan.newCards.length,
    forTomorrow: plan.postponed.length,
    forced: plan.forced.length,
    shownMinutes: shownMinutesOf(plan, gathered.estimates.ownReviewAttempts),
    initialEstimate: durationLabel(1, gathered.estimates.ownReviewAttempts).initial,
    why: {
      due: gathered.reviews.length,
      reviewSeconds: Math.max(1, Math.round(gathered.estimates.reviewSeconds)),
      ownAttempts: gathered.estimates.ownReviewAttempts,
    },
    brake: { band: gathered.brake.band, days: Math.round(gathered.backlogDays * 10) / 10 },
    postponedCount: gathered.postponedCount,
    maintenance: null,
    alternatives: alternativesOf(db, gathered, plan, chosen),
  };
}
