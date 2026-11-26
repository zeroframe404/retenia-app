import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import {
  buildInterleavedSet,
  eligibleTypes,
  type ProblemType,
  setProblems,
} from '../core/interleave';
import { currentEvaluation } from '../core/ledger';
import type { Verdict } from '../core/memory';
import { studyDayOf } from '../core/study-day';
import type { SetRun, SetSummary } from '../preload/contract/procedures';
import { CardOutOfReviewsError, CardPausedError } from './card-errors';
import { parsedActivity } from './cards';
import { activeCard, findCard } from './content';
import type { ReteniaDatabase } from './database';
import { appendObservation, readPayload, type StoredPayload } from './ledger';
import type { Writer } from './orm';
import { cards, evaluations, observations } from './schema';

// El conjunto intercalado (Fase 18, CA-162): una vuelta del conjunto guarda los problemas en el
// orden en que van a salir. La ventana pide el próximo y no sabe de qué tipo es hasta el cierre.

class SetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SetError';
  }
}

type Run = StoredPayload<'set.started'>;

export interface SetsStore {
  open(input: { cardId: string; runId: string }): SetRun;
  summary(input: { runId: string }): SetSummary;
}

// ¿Ese ejercicio es parte de esa vuelta? (lo pregunta «Enviar» antes de anotar la vuelta).
export function runIncludes(db: Writer, runId: string, cardId: string): boolean {
  return runOf(db, runId)?.items.some((item) => item.cardId === cardId) === true;
}

function runOf(db: Writer, runId: string): Run | null {
  const row = db
    .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
    .from(observations)
    .where(eq(observations.idempotencyKey, `set:${runId}`))
    .get();
  return row ? readPayload('set.started', row.schemaVersion, row.payload) : null;
}

// Los intentos de unas tarjetas, con la vuelta del conjunto en la que fueron (nula si fueron por
// separado) y su evaluación vigente.
function attemptsOf(db: Writer, cardIds: readonly string[]) {
  if (cardIds.length === 0) {
    return [];
  }
  const rows = db
    .select({
      id: observations.id,
      cardId: observations.cardId,
      sessionId: observations.sessionId,
    })
    .from(observations)
    .where(
      and(
        inArray(observations.cardId, [...cardIds]),
        sql`${observations.kind} in ('attempt.submitted', 'review.graded')`,
      ),
    )
    .orderBy(observations.seq)
    .all();
  const versions = db
    .select({
      attemptId: evaluations.attemptId,
      id: evaluations.id,
      version: evaluations.version,
      verdict: evaluations.verdict,
      affected: evaluations.affected,
    })
    .from(evaluations)
    .innerJoin(observations, eq(observations.id, evaluations.attemptId))
    .where(inArray(observations.cardId, [...cardIds]))
    .all();
  return rows.map((row) => {
    const current = currentEvaluation(versions.filter((version) => version.attemptId === row.id));
    return {
      cardId: row.cardId ?? '',
      sessionId: row.sessionId,
      verdict: current === null ? null : (current.verdict as Verdict),
      valid: current !== null && current.affected !== 1,
    };
  });
}

const OUT = ['in_review', 'retired'];

export function createSetsStore(db: ReteniaDatabase, clock: Clock): SetsStore {
  const { orm } = db;

  function setCard(tx: Writer, cardId: string) {
    const row = activeCard(tx, cardId);
    if (row.pausedAt !== null) {
      throw new CardPausedError();
    }
    if (OUT.includes(row.sheetState)) {
      throw new CardOutOfReviewsError();
    }
    const activity = parsedActivity(row);
    if (activity?.type !== 'interleaved') {
      throw new SetError('Esa tarjeta no es un conjunto');
    }
    return { row, types: activity.types };
  }

  // Cuántos problemas de la vuelta ya se contestaron y cuál sigue.
  function progress(tx: Writer, run: Run) {
    const done = new Set(
      attemptsOf(
        tx,
        run.items.map((item) => item.cardId),
      )
        .filter((attempt) => attempt.sessionId === run.runId)
        .map((attempt) => attempt.cardId),
    );
    // Uno que dejó de poder practicarse (en pausa o borrado) no traba la vuelta.
    const next = run.items.find((item) => {
      if (done.has(item.cardId)) {
        return false;
      }
      const row = findCard(tx, item.cardId);
      return (
        row !== undefined &&
        row.deletedAt === null &&
        row.pausedAt === null &&
        !OUT.includes(row.sheetState)
      );
    });
    return { done: done.size, nextCardId: next?.cardId ?? null };
  }

  const runResponse = (tx: Writer, run: Run): SetRun => ({
    kind: 'run',
    runId: run.runId,
    title: run.title,
    total: run.items.length,
    ...progress(tx, run),
  });

  // La vuelta de hoy de ese conjunto que quedó a medias.
  function unfinished(tx: Writer, cardId: string): Run | null {
    const last = tx
      .select({
        payload: observations.payload,
        schemaVersion: observations.schemaVersion,
        at: observations.occurredAt,
      })
      .from(observations)
      .where(and(eq(observations.cardId, cardId), eq(observations.kind, 'set.started')))
      .orderBy(observations.seq)
      .all()
      .at(-1);
    if (!last || studyDayOf(new Date(last.at)) !== studyDayOf(clock.now())) {
      return null;
    }
    const run = readPayload('set.started', last.schemaVersion, last.payload);
    return progress(tx, run).nextCardId === null ? null : run;
  }

  // Los problemas que se pueden usar de cada tipo, con su materia y su enunciado.
  function usable(tx: Writer, types: readonly ProblemType[]) {
    const subjects = new Map<string, string | null>();
    const statements = new Map<string, string>();
    const filtered = types.map((type) => ({
      ...type,
      cardIds: type.cardIds.filter((cardId) => {
        const row = findCard(tx, cardId);
        if (
          !row ||
          row.deletedAt !== null ||
          row.pausedAt !== null ||
          row.activityType === null ||
          OUT.includes(row.sheetState)
        ) {
          return false;
        }
        subjects.set(cardId, row.subjectId);
        statements.set(cardId, row.question);
        return true;
      }),
    }));
    return { types: filtered, subjects, statements };
  }

  return {
    open({ cardId, runId }) {
      return orm.transaction((tx): SetRun => {
        const { row, types } = setCard(tx, cardId);
        const asked = runOf(tx, runId) ?? unfinished(tx, cardId);
        if (asked) {
          return runResponse(tx, asked);
        }
        const available = usable(tx, types);
        const own = tx
          .select({ subjectId: cards.subjectId })
          .from(cards)
          .where(eq(cards.id, cardId))
          .get();
        const withCards = available.types.filter((type) => type.cardIds.length > 0);
        const problems = setProblems(withCards, available);
        if (
          problems.includes('subjects') ||
          [...available.subjects.values()].some((subject) => subject !== own?.subjectId)
        ) {
          return { kind: 'invalid', reason: 'subjects' };
        }
        if (problems.includes('namesType')) {
          return { kind: 'invalid', reason: 'namesType' };
        }
        if (withCards.length < 2) {
          return { kind: 'invalid', reason: 'empty' };
        }
        // Solo los tipos que ya practicaste por separado (fuera de una vuelta de un conjunto).
        const runIds = new Set(
          tx
            .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
            .from(observations)
            .where(eq(observations.kind, 'set.started'))
            .all()
            .map((item) => readPayload('set.started', item.schemaVersion, item.payload).runId),
        );
        const practiced = new Set(
          attemptsOf(
            tx,
            withCards.flatMap((type) => type.cardIds),
          )
            .filter(
              (attempt) =>
                attempt.valid && (attempt.sessionId === null || !runIds.has(attempt.sessionId)),
            )
            .map((attempt) => attempt.cardId),
        );
        const eligible = eligibleTypes(withCards, practiced);
        if (eligible.length < 2) {
          return {
            kind: 'notReady',
            missing: withCards.filter((type) => !eligible.includes(type)).map((type) => type.name),
          };
        }
        const names = new Map(eligible.map((type) => [type.id, type.name]));
        appendObservation(tx, clock, {
          kind: 'set.started',
          payload: {
            cardId,
            runId,
            title: row.question,
            items: buildInterleavedSet(eligible, runId).map((item) => ({
              ...item,
              typeName: names.get(item.typeId) ?? '',
            })),
          },
          idempotencyKey: `set:${runId}`,
          source: 'user',
        });
        const run = runOf(tx, runId);
        if (!run) {
          throw new SetError('No pude armar el conjunto');
        }
        return runResponse(tx, run);
      });
    },

    summary({ runId }) {
      const run = runOf(orm, runId);
      if (!run) {
        throw new SetError('No encontré esa vuelta del conjunto');
      }
      const attempts = attemptsOf(
        orm,
        run.items.map((item) => item.cardId),
      ).filter((attempt) => attempt.sessionId === runId);
      const order = run.items.map((item, index) => ({
        position: index + 1,
        typeName: item.typeName,
        verdict: attempts.find((attempt) => attempt.cardId === item.cardId)?.verdict ?? null,
      }));
      return {
        title: run.title,
        order,
        complete: progress(orm, run).nextCardId === null,
      };
    },
  };
}
