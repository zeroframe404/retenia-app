import { and, eq, inArray } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { engineSignal, helpLevelOf, maxHelpLevel, purposeOf } from '../core/evaluation';
import { currentEvaluation } from '../core/ledger';
import type { HelpLevel, Verdict } from '../core/memory';
import {
  blankStepIds,
  checkStep,
  type LadderEvent,
  type LadderResult,
  type Procedure,
  procedureHelpLevel,
  procedureVerdict,
  projectLadder,
  type ResolvedStep,
  type Rung,
  resolveSteps,
  rungsOf,
  type StepState,
} from '../core/procedure';
import { studyDayOf } from '../core/study-day';
import { formatValue, renderTemplate } from '../core/variants';
import type { HelpUseValue } from '../preload/contract/activities';
import type {
  CorrectionValue,
  LadderValue,
  ProcedureCheck,
  ProcedureResult,
  ProcedureView,
  RungValue,
} from '../preload/contract/procedures';
import { CardOutOfReviewsError, CardPausedError } from './card-errors';
import { asMode, parsedActivity } from './cards';
import { activeCard, type CardRow, cardOf } from './content';
import type { ReteniaDatabase } from './database';
import { appendEvaluation, appendObservation, readPayload, type StoredPayload } from './ledger';
import { pendingReturnSteps } from './micro';
import type { Writer } from './orm';
import { recomputeCardSchedule } from './projections';
import { cardVersions, evaluations, observations } from './schema';
import { stepStatesOf } from './step-states';
import { isNewVariant, showVariant, variantOfOpening } from './variants';

// El procedimiento (Fase 18, H-37): la escalera de apoyo sale del historial; cada envío es un
// intento (`attempt.submitted`) y se evalúa después de la corrección. «Hay un error en el paso N»
// se dice antes de mostrarla, y se puede reintentar ese paso.

class NotAProcedureError extends Error {
  constructor() {
    super('Esa tarjeta no es un procedimiento');
    this.name = 'NotAProcedureError';
  }
}

class ProcedureStepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProcedureStepError';
  }
}

interface ProcedureAttemptInput {
  cardId: string;
  openingId: string;
  attemptId: string;
  answers: readonly { stepId: string; written: string }[];
  help: readonly HelpUseValue[];
  noIdea: boolean;
  shownAt: string;
  firstInputMs: number | null;
  submittedMs: number | null;
}

export interface ProceduresStore {
  open(input: { cardId: string; openingId: string }): ProcedureView;
  studied(input: {
    cardId: string;
    openingId: string;
    why: readonly { stepId: string; text: string }[];
  }): { ladder: LadderValue };
  check(input: ProcedureAttemptInput): ProcedureCheck;
  retry(input: { attemptId: string; stepId: string; retryId: string; written: string }): {
    ok: boolean;
    next: { stepId: string; position: number } | null;
  };
  correction(input: { attemptId: string }): CorrectionValue;
  finish(input: {
    attemptId: string;
    self: readonly { stepId: string; ok: boolean }[];
  }): ProcedureResult;
}

type Attempt = StoredPayload<'attempt.submitted'> & { id: string };

function procedureOf(row: { activity: string | null }): Procedure {
  const activity = parsedActivity(row);
  if (activity?.type !== 'procedure') {
    throw new NotAProcedureError();
  }
  return activity;
}

const LADDER_KINDS = ['procedure.studied', 'attempt.submitted'];

// Los eventos de la escalera de un procedimiento: el ejemplo explicado y cada intento evaluado.
function ladderEvents(db: Writer, cardId: string): LadderEvent[] {
  const rows = db
    .select({
      id: observations.id,
      seq: observations.seq,
      kind: observations.kind,
      payload: observations.payload,
      schemaVersion: observations.schemaVersion,
      at: observations.occurredAt,
    })
    .from(observations)
    .where(and(eq(observations.cardId, cardId), inArray(observations.kind, LADDER_KINDS)))
    .orderBy(observations.seq)
    .all();
  const versions = db
    .select({
      attemptId: evaluations.attemptId,
      version: evaluations.version,
      components: evaluations.components,
      affected: evaluations.affected,
      id: evaluations.id,
    })
    .from(evaluations)
    .innerJoin(observations, eq(observations.id, evaluations.attemptId))
    .where(eq(observations.cardId, cardId))
    .all();
  const events: LadderEvent[] = [];
  for (const row of rows) {
    const base = { id: row.id, seq: row.seq, studyDay: studyDayOf(new Date(row.at)) };
    if (row.kind === 'procedure.studied') {
      events.push({ ...base, kind: 'studied' });
      continue;
    }
    const attempt = readPayload('attempt.submitted', row.schemaVersion, row.payload);
    if (attempt.activityType !== 'procedure') {
      continue;
    }
    const states = stepStatesOf(versions.filter((version) => version.attemptId === row.id));
    if (states === null) {
      continue;
    }
    events.push({
      ...base,
      kind: 'attempt',
      failedStep: states.find((step) => step.state !== 'ok')?.id ?? null,
      aided: attempt.help.some((use) => !['A0', 'A1'].includes(use.level)),
    });
  }
  return events;
}

function ladderOf(db: Writer, cardId: string, stepCount: number): LadderResult {
  return projectLadder(rungsOf(stepCount).length, ladderEvents(db, cardId));
}

// El escalón con que se practica hoy: sale del historial sin lo último que anotaste hoy. Lo que
// ganes o falles hoy cambia la próxima vez, no en la misma sesión. Se saca solo el tramo final de
// hoy (en el orden en que se registró): si la fecha vuelve atrás, el escalón no retrocede.
function todaysRung(db: Writer, cardId: string, stepCount: number, today: string): number {
  const events = ladderEvents(db, cardId);
  while (events.at(-1)?.studyDay === today) {
    events.pop();
  }
  return projectLadder(rungsOf(stepCount).length, events).level;
}

const rungValue = (rung: Rung): RungValue => ({
  kind: rung.kind,
  blanks: rung.kind === 'blanks' ? rung.count : 0,
});

const rungAt = (stepCount: number, level: number): Rung => {
  const rungs = rungsOf(stepCount);
  return rungs[Math.min(level, rungs.length - 1)] as Rung;
};

export const resultText = (step: ResolvedStep): string =>
  step.expected.type === 'number'
    ? `${formatValue(step.expected.value)}${step.expected.unit === null ? '' : ` ${step.expected.unit}`}`
    : step.expected.text;

// El enunciado de la variante: el de siempre y, en el escalón «variante», otro de la familia si hay.
function statementOf(
  procedure: Procedure,
  rung: Rung,
  shown: { n: number; values: Readonly<Record<string, number>> } | null,
): string {
  const statements = procedure.family?.statements ?? [];
  if (statements.length === 0 || shown === null) {
    return '';
  }
  const others = statements.slice(1);
  const template =
    rung.kind === 'variant' && others.length > 0
      ? (others[shown.n % others.length] as string)
      : (statements[0] as string);
  return renderTemplate(template, shown.values);
}

export function createProceduresStore(db: ReteniaDatabase, clock: Clock): ProceduresStore {
  const { orm } = db;

  function practicable(tx: Writer, cardId: string): CardRow {
    const row = activeCard(tx, cardId);
    if (row.pausedAt !== null) {
      throw new CardPausedError();
    }
    if (row.sheetState === 'in_review' || row.sheetState === 'retired') {
      throw new CardOutOfReviewsError();
    }
    return row;
  }

  function attemptOf(tx: Writer, attemptId: string): Attempt {
    const row = tx
      .select({
        id: observations.id,
        kind: observations.kind,
        payload: observations.payload,
        schemaVersion: observations.schemaVersion,
      })
      .from(observations)
      .where(eq(observations.idempotencyKey, `attempt:${attemptId}`))
      .get();
    const found =
      row ??
      tx
        .select({
          id: observations.id,
          kind: observations.kind,
          payload: observations.payload,
          schemaVersion: observations.schemaVersion,
        })
        .from(observations)
        .where(eq(observations.id, attemptId))
        .get();
    if (found?.kind !== 'attempt.submitted') {
      throw new ProcedureStepError('No encontré ese intento');
    }
    const payload = readPayload('attempt.submitted', found.schemaVersion, found.payload);
    if (payload.activityType !== 'procedure') {
      throw new ProcedureStepError('Ese intento no es de un procedimiento');
    }
    return { ...payload, id: found.id };
  }

  // Los pasos del intento, con los números de su variante y la versión que se contestó.
  function stepsOf(tx: Writer, attempt: Attempt): ResolvedStep[] {
    const row = versionOf(tx, attempt.versionId);
    return resolveSteps(procedureOf(row), attempt.variant?.values ?? {});
  }

  function retriesOf(tx: Writer, attempt: Attempt) {
    return tx
      .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
      .from(observations)
      .where(
        and(
          eq(observations.cardId, attempt.cardId),
          eq(observations.kind, 'procedure.step_retried'),
        ),
      )
      .orderBy(observations.seq)
      .all()
      .map((item) => readPayload('procedure.step_retried', item.schemaVersion, item.payload))
      .filter((item) => item.attemptId === attempt.id);
  }

  const isRevealed = (tx: Writer, attemptId: string) =>
    tx
      .select({ id: observations.id })
      .from(observations)
      .where(eq(observations.idempotencyKey, `reveal:${attemptId}`))
      .get() !== undefined;

  // Cómo va cada paso vacío: bien, corregido al reintentar, mal o para comparar con el modelo.
  function progressOf(tx: Writer, attempt: Attempt) {
    const retries = retriesOf(tx, attempt);
    return (attempt.procedure?.checks ?? []).map((check) => {
      const own = retries.filter((retry) => retry.stepId === check.stepId);
      const state =
        check.state === 'wrong' && own.some((retry) => retry.ok) ? ('fixed' as const) : check.state;
      return { stepId: check.stepId, state, retried: own.at(-1)?.written ?? null };
    });
  }

  function writtenOf(attempt: Attempt, stepId: string): string {
    return attempt.answer.type === 'procedure'
      ? (attempt.answer.steps.find((step) => step.stepId === stepId)?.written ?? '')
      : '';
  }

  function correctionOf(tx: Writer, attempt: Attempt): CorrectionValue {
    const steps = stepsOf(tx, attempt);
    return {
      attemptId: attempt.id,
      steps: progressOf(tx, attempt).map((item) => {
        const step = steps.find((candidate) => candidate.id === item.stepId) as ResolvedStep;
        return {
          id: step.id,
          position: step.position,
          prompt: step.prompt,
          written: writtenOf(attempt, step.id),
          retried: item.retried,
          state: item.state,
          expected: resultText(step),
          explanation: step.explanation,
        };
      }),
    };
  }

  function reveal(tx: Writer, attempt: Attempt): void {
    appendObservation(tx, clock, {
      kind: 'procedure.revealed',
      payload: { cardId: attempt.cardId, attemptId: attempt.id },
      idempotencyKey: `reveal:${attempt.id}`,
      source: 'user',
    });
  }

  const nextWrong = (tx: Writer, attempt: Attempt) => {
    const steps = stepsOf(tx, attempt);
    const open = progressOf(tx, attempt).find((item) => item.state === 'wrong');
    const step = steps.find((candidate) => candidate.id === open?.stepId);
    return step ? { stepId: step.id, position: step.position } : null;
  };

  // La escalera después de un evento: el próximo escalón y qué cambió.
  function ladderValue(
    tx: Writer,
    cardId: string,
    stepCount: number,
    eventId: string,
  ): LadderValue {
    const ladder = ladderOf(tx, cardId, stepCount);
    const own = ladder.steps.find((step) => step.id === eventId);
    return {
      next: rungValue(rungAt(stepCount, ladder.level)),
      change: own?.change ?? null,
      counted: own?.counted ?? false,
    };
  }

  return {
    open({ cardId, openingId }) {
      return orm.transaction((tx) => {
        const row = practicable(tx, cardId);
        const procedure = procedureOf(row);
        const count = procedure.steps.length;
        const rung = rungAt(count, todaysRung(tx, cardId, count, studyDayOf(clock.now())));
        const shown =
          procedure.family === null
            ? null
            : showVariant(tx, clock, {
                cardId,
                versionId: row.versionId,
                family: procedure.family,
                openingId,
              });
        const steps = resolveSteps(procedure, shown?.values ?? {});
        const blanks = new Set(
          blankStepIds(
            rung,
            steps.map((step) => step.id),
          ),
        );
        // El punto de un micro-ejercicio superado vuelve acá, sin aviso.
        if (rung.kind !== 'example') {
          for (const stepId of pendingReturnSteps(tx, cardId)) {
            blanks.add(stepId);
          }
        }
        const studied = tx
          .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
          .from(observations)
          .where(and(eq(observations.cardId, cardId), eq(observations.kind, 'procedure.studied')))
          .orderBy(observations.seq)
          .all()
          .map((item) => readPayload('procedure.studied', item.schemaVersion, item.payload));
        return {
          cardId,
          title: row.question,
          statement: statementOf(procedure, rung, shown),
          rung: rungValue(rung),
          steps: steps.map((step) => {
            const blank = blanks.has(step.id);
            return {
              id: step.id,
              position: step.position,
              prompt: step.prompt,
              key: step.key,
              blank,
              answerType: step.expected.type,
              unit: step.expected.type === 'number' ? step.expected.unit : null,
              solved: blank ? null : { result: resultText(step), explanation: step.explanation },
            };
          }),
          previousWhy: studied.at(-1)?.why ?? [],
        };
      });
    },

    studied({ cardId, openingId, why }) {
      return orm.transaction((tx) => {
        const row = practicable(tx, cardId);
        const procedure = procedureOf(row);
        const keys = new Set(procedure.steps.filter((step) => step.key).map((step) => step.id));
        const observation = appendObservation(tx, clock, {
          kind: 'procedure.studied',
          payload: {
            cardId,
            versionId: row.versionId,
            openingId,
            why: why
              .filter((item) => keys.has(item.stepId))
              .map((item) => ({ stepId: item.stepId, answer: item.text.trim() })),
          },
          idempotencyKey: `studied:${openingId}`,
          source: 'user',
        });
        return { ladder: ladderValue(tx, cardId, procedure.steps.length, observation.id) };
      });
    },

    check(input) {
      return orm.transaction((tx): ProcedureCheck => {
        const repeated = tx
          .select({ id: observations.id })
          .from(observations)
          .where(eq(observations.idempotencyKey, `attempt:${input.attemptId}`))
          .get();
        if (repeated === undefined) {
          saveAttempt(tx, input);
        }
        const attempt = attemptOf(tx, input.attemptId);
        if (attempt.cardId !== input.cardId) {
          throw new ProcedureStepError('Ese intento ya se guardó con otra tarjeta');
        }
        const wrong = nextWrong(tx, attempt);
        if (wrong !== null && !isRevealed(tx, attempt.id)) {
          return { kind: 'error', attemptId: attempt.id, step: wrong };
        }
        reveal(tx, attempt);
        return { kind: 'correction', correction: correctionOf(tx, attempt) };
      });
    },

    retry({ attemptId, stepId, retryId, written }) {
      return orm.transaction((tx) => {
        const attempt = attemptOf(tx, attemptId);
        if (isRevealed(tx, attempt.id)) {
          throw new ProcedureStepError('La corrección ya está a la vista');
        }
        const step = stepsOf(tx, attempt).find((candidate) => candidate.id === stepId);
        const blank = attempt.procedure?.blanks.includes(stepId) === true;
        if (!step || !blank || step.expected.type !== 'number') {
          throw new ProcedureStepError('Ese paso no se puede reintentar');
        }
        const ok = checkStep(step, written) === 'ok';
        appendObservation(tx, clock, {
          kind: 'procedure.step_retried',
          payload: { cardId: attempt.cardId, attemptId: attempt.id, stepId, written, ok },
          idempotencyKey: `step-retry:${retryId}`,
          source: 'user',
        });
        return { ok, next: nextWrong(tx, attempt) };
      });
    },

    correction({ attemptId }) {
      return orm.transaction((tx) => {
        const attempt = attemptOf(tx, attemptId);
        reveal(tx, attempt);
        return correctionOf(tx, attempt);
      });
    },

    finish({ attemptId, self }) {
      return orm.transaction((tx): ProcedureResult => {
        const attempt = attemptOf(tx, attemptId);
        if (!isRevealed(tx, attempt.id)) {
          throw new ProcedureStepError('Primero se mira la corrección');
        }
        const steps = stepsOf(tx, attempt);
        const saved = currentEvaluation(
          tx.select().from(evaluations).where(eq(evaluations.attemptId, attempt.id)).all(),
        );
        if (saved === null) {
          const assessed = new Map(self.map((item) => [item.stepId, item.ok]));
          const states = progressOf(tx, attempt).map((item) => {
            if (item.state !== 'self') {
              return { id: item.stepId, state: item.state };
            }
            const ok = assessed.get(item.stepId);
            if (ok === undefined) {
              throw new ProcedureStepError('Falta comparar un paso con el modelo');
            }
            return { id: item.stepId, state: (ok ? 'ok' : 'wrong') as StepState };
          });
          const verdict = procedureVerdict(states.map((item) => item.state));
          appendEvaluation(tx, clock, {
            attemptId: attempt.id,
            verdict,
            source: self.length > 0 ? 'user' : 'rule',
            proposedVerdict: verdict,
            rubricVersion: 'steps-1',
            contentVersionId: attempt.versionId,
            components: { steps: states },
            engineSignal: engineSignal({
              verdict,
              helpLevel: attempt.helpLevel,
              optionsQuestion: false,
            }),
            cause: 'graded',
          });
          recomputeCardSchedule(tx, attempt.cardId);
        }
        const current = currentEvaluation(
          tx.select().from(evaluations).where(eq(evaluations.attemptId, attempt.id)).all(),
        );
        const states = JSON.parse(current?.components ?? '{"steps":[]}') as {
          steps: { id: string; state: StepState }[];
        };
        return {
          verdict: (current?.verdict ?? 'incorrect') as Verdict,
          steps: states.steps.map((item) => ({
            id: item.id,
            state: item.state,
            position: steps.find((step) => step.id === item.id)?.position ?? 1,
          })),
          ladder: ladderValue(tx, attempt.cardId, steps.length, attempt.id),
          nextReviewDay: cardOf(tx, attempt.cardId).nextReviewDay,
        };
      });
    },
  };

  // El envío: los resultados de los pasos numéricos se comparan acá; la ventana no decide nada.
  function saveAttempt(tx: Writer, input: ProcedureAttemptInput): void {
    const row = practicable(tx, input.cardId);
    const procedure = procedureOf(row);
    const count = procedure.steps.length;
    const rungIndex = todaysRung(tx, input.cardId, count, studyDayOf(clock.now()));
    const rung = rungAt(count, rungIndex);
    const shown =
      procedure.family === null ? null : variantOfOpening(tx, input.cardId, input.openingId);
    if (procedure.family !== null && shown === null) {
      throw new ProcedureStepError('Falta abrir el procedimiento');
    }
    const steps = resolveSteps(procedure, shown?.values ?? {});
    const blanks = new Set(
      blankStepIds(
        rung,
        steps.map((step) => step.id),
      ),
    );
    if (rung.kind !== 'example') {
      for (const stepId of pendingReturnSteps(tx, input.cardId)) {
        blanks.add(stepId);
      }
    }
    const open = steps.filter((step) => blanks.has(step.id));
    if (open.length === 0) {
      throw new ProcedureStepError('No hay pasos para completar');
    }
    const written = new Map(input.answers.map((answer) => [answer.stepId, answer.written]));
    const help = input.help.map((use) => ({
      ...use,
      level: helpLevelOf({ kind: use.kind, index: use.index }),
    }));
    const attemptNo =
      tx
        .select({ id: observations.id, payload: observations.payload })
        .from(observations)
        .where(
          and(eq(observations.cardId, input.cardId), eq(observations.kind, 'attempt.submitted')),
        )
        .all()
        .filter(
          (item) =>
            (JSON.parse(item.payload) as { openingId?: string }).openingId === input.openingId,
        ).length + 1;
    const levels: HelpLevel[] = [procedureHelpLevel(rung), maxHelpLevel(help)];
    const helpLevel = levels.sort().at(-1) as HelpLevel;
    appendObservation(tx, clock, {
      kind: 'attempt.submitted',
      payload: {
        cardId: input.cardId,
        versionId: row.versionId,
        activityType: 'procedure',
        openingId: input.openingId,
        attemptNo,
        rule: 'chosen',
        purpose: purposeOf({ mode: asMode(row.mode), used: help, attemptNo }),
        answer: {
          type: 'procedure',
          steps: open.map((step) => ({ stepId: step.id, written: written.get(step.id) ?? '' })),
        },
        help,
        helpLevel,
        noIdea: input.noIdea,
        optionsQuestion: false,
        confidence: null,
        shownAt: input.shownAt,
        firstInputMs: input.firstInputMs,
        submittedMs: input.submittedMs,
        ...(shown === null
          ? {}
          : {
              variant: {
                n: shown.n,
                values: shown.values,
                isNew: isNewVariant(tx, input.cardId, shown.n),
              },
            }),
        procedure: {
          rung: rungIndex,
          blanks: open.map((step) => step.id),
          checks: open.map((step) => ({
            stepId: step.id,
            state: checkStep(step, written.get(step.id) ?? ''),
          })),
        },
      },
      idempotencyKey: `attempt:${input.attemptId}`,
      source: 'user',
    });
  }

  function versionOf(tx: Writer, versionId: string): { activity: string | null } {
    const row = tx
      .select({ activity: cardVersions.activity })
      .from(cardVersions)
      .where(eq(cardVersions.id, versionId))
      .get();
    if (!row) {
      throw new NotAProcedureError();
    }
    return row;
  }
}
