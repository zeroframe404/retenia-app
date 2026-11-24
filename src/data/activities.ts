import { and, eq, sql } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import {
  type Activity,
  allowedVerdicts,
  canSetVerdict,
  engineSignal,
  evaluateNumeric,
  evaluateOptions,
  evaluateOrder,
  evaluateShort,
  type HelpUse,
  helpAvailability,
  initialOrder,
  maxHelpLevel,
  modeLabel,
  nextHint,
  normalizeShortAnswer,
  purposeOf,
  type ResultParts,
  resultParts,
  shuffledOptions,
  verdictFromUnits,
} from '../core/evaluation';
import { currentEvaluation } from '../core/ledger';
import type { Verdict } from '../core/memory';
import type {
  ActivityHelp,
  ActivityOpening,
  AmendmentNotice,
  AppealReason,
  AppealResult,
  AttemptAnswer,
  AttemptDetail,
  FinalResult,
  HelpUseValue,
  Proposal,
  SubmitResult,
} from '../preload/contract/activities';
import { CardOutOfReviewsError, CardPausedError } from './card-errors';
import { asMode, flagCardVersion, parsedActivity } from './cards';
import { activeCard, CardNotFoundError, type CardRow, cardOf, sheetOf } from './content';
import type { ReteniaDatabase } from './database';
import { newId } from './ids';
import { appendEvaluation, appendObservation, appendOperation, readPayload } from './ledger';
import { describeCite } from './materials';
import type { Writer } from './orm';
import { pendingCheckOf, recomputeCardSchedule } from './projections';
import { cards, cardVersions, evaluations, observations } from './schema';

// Las actividades de la Fase 16 (H-31 a H-33). Cada intento sobre un ejercicio es una observación
// `attempt.submitted` (al tocar «Enviar»); su evaluación se guarda al salir del resultado
// (versión 1) y cada corrección posterior es una versión nueva que apunta a la anterior. La agenda
// se recalcula desde el historial en la misma transacción. Nada se borra: «Deshacer» agrega.

class NotAnExerciseError extends Error {
  constructor() {
    super('Esa tarjeta no es un ejercicio');
    this.name = 'NotAnExerciseError';
  }
}

class AnswerTypeMismatchError extends Error {
  constructor() {
    super('La respuesta no es del tipo de la actividad');
    this.name = 'AnswerTypeMismatchError';
  }
}

class AttemptNotFoundError extends Error {
  constructor() {
    super('No encontré ese intento');
    this.name = 'AttemptNotFoundError';
  }
}

class VerdictAboveProposalError extends Error {
  constructor() {
    super('El resultado no puede quedar más alto que el que propuso Retenia');
    this.name = 'VerdictAboveProposalError';
  }
}

class HelpNotAvailableError extends Error {
  constructor() {
    super('Esa ayuda no está disponible ahora');
    this.name = 'HelpNotAvailableError';
  }
}

class AmendmentNotFoundError extends Error {
  constructor() {
    super('No encontré esa corrección');
    this.name = 'AmendmentNotFoundError';
  }
}

class AttemptConflictError extends Error {
  constructor() {
    super('Ese intento ya se guardó con otra tarjeta');
    this.name = 'AttemptConflictError';
  }
}

// La versión de cada regla (se guarda con la evaluación).
const RUBRIC: Record<Activity['type'], string> = {
  short: 'short-1',
  numeric: 'numeric-1',
  options: 'options-1',
  order: 'order-1',
  open: 'units-1',
};

interface SubmitInput {
  cardId: string;
  openingId: string;
  attemptId: string;
  attemptNo: number;
  answer: AttemptAnswer;
  help: readonly HelpUseValue[];
  noIdea: boolean;
  shownAt: string;
  firstInputMs: number | null;
  submittedMs: number | null;
}

export interface ActivitiesStore {
  // «Practicar ahora»: lo que hace falta para mostrar la actividad, sin la respuesta.
  start(input: { cardId: string; openingId: string }): ActivityOpening;
  // Una ayuda de la barra: la próxima pista, el ejemplo, la fuente o la solución.
  help(input: {
    cardId: string;
    kind: HelpUse['kind'];
    used: readonly HelpUseValue[];
    confirmed?: boolean | undefined;
    attemptNo: number;
  }): ActivityHelp;
  // «Enviar»: guarda el intento y devuelve lo que propone Retenia (todavía sin evaluación).
  submit(input: SubmitInput): SubmitResult;
  // Respuesta abierta: lo que propone Retenia según las unidades marcadas (no guarda nada).
  propose(input: {
    attemptId: string;
    marked: readonly string[];
    verdict?: Verdict | undefined;
  }): Proposal;
  // Al salir del resultado: la evaluación (versión 1), nunca más alta que lo propuesto.
  finalize(input: {
    attemptId: string;
    verdict: Verdict;
    marked?: readonly string[] | undefined;
  }): FinalResult;
  // «Discrepo» con uno de los cuatro motivos.
  appeal(input: {
    attemptId: string;
    reason: AppealReason;
    verdict?: Verdict | undefined;
    marked?: readonly string[] | undefined;
  }): AppealResult;
  // «Deshacer» del aviso de evaluación corregida: deshacerlo dos veces no agrega nada.
  undoAmendment(input: { amendmentId: string }): { verdict: Verdict; nextReviewDay: string | null };
  // «Entendido»: el aviso no se muestra más.
  acknowledge(input: { amendmentId: string }): void;
  // Los avisos que todavía no se confirmaron con «Entendido» ni se deshicieron.
  notices(input: { cardId: string }): AmendmentNotice[];
}

type VersionRow = typeof cardVersions.$inferSelect;
type StoredAttempt = ReturnType<typeof readPayload<'attempt.submitted'>> & { id: string };

function exerciseOf(row: { activity: string | null }): Activity {
  const activity = parsedActivity(row);
  if (activity === null) {
    throw new NotAnExerciseError();
  }
  return activity;
}

function assertPracticable(row: CardRow): void {
  if (row.pausedAt !== null) {
    throw new CardPausedError();
  }
  if (row.sheetState === 'in_review' || row.sheetState === 'retired') {
    throw new CardOutOfReviewsError();
  }
}

const listOf = (json: string): string[] => {
  const parsed: unknown = JSON.parse(json);
  return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
};

interface Evaluated {
  readonly proposed: Verdict;
  readonly detail: AttemptDetail;
  readonly components: unknown;
  readonly numericReason: 'unreadable' | 'unit' | 'off' | null;
  readonly missing: string[];
}

// Lo que propone Retenia para una respuesta con el contenido de esa versión (y, en una abierta, con
// las unidades marcadas).
function evaluate(
  version: Pick<VersionRow, 'answer' | 'variants' | 'activity'>,
  answer: AttemptAnswer,
  marked: readonly string[] = [],
): Evaluated {
  const activity = exerciseOf(version);
  if (answer.type !== activity.type) {
    throw new AnswerTypeMismatchError();
  }
  const variants = listOf(version.variants);
  switch (activity.type) {
    case 'short': {
      const text = answer.type === 'short' ? answer.text : '';
      const result = evaluateShort(text, [version.answer, ...variants]);
      return {
        proposed: result.verdict,
        detail: { type: 'short', written: text, expected: result.closest, diff: [...result.diff] },
        components: { matched: result.matched, closest: result.closest },
        numericReason: null,
        missing: [],
      };
    }
    case 'numeric': {
      const raw = answer.type === 'numeric' ? answer.raw : '';
      const result = evaluateNumeric(raw, activity, variants);
      return {
        proposed: result.verdict,
        detail: {
          type: 'numeric',
          expected: activity.value,
          tolerance: activity.tolerance,
          unit: activity.unit,
          reason: result.reason,
        },
        components: { value: result.value, unit: result.unit, reason: result.reason },
        numericReason: result.reason,
        missing: [],
      };
    }
    case 'options': {
      const chosenId = answer.type === 'options' ? answer.optionId : '';
      const result = evaluateOptions(chosenId, activity.options);
      const correct = activity.options.find((option) => option.correct);
      return {
        proposed: result.verdict,
        detail: {
          type: 'options',
          chosenId,
          correctId: correct?.id ?? '',
          correctText: correct?.text ?? '',
          explanation: result.explanation,
        },
        components: { chosenId, correctId: correct?.id ?? null },
        numericReason: null,
        missing: [],
      };
    }
    case 'order': {
      const given = answer.type === 'order' ? answer.stepIds : [];
      const correct = activity.steps.map((step) => step.id);
      const result = evaluateOrder(given, correct, activity.acceptedOrders);
      const text = new Map(activity.steps.map((step) => [step.id, step.text]));
      return {
        proposed: result.verdict,
        detail: {
          type: 'order',
          given: given.map((id, n) => ({
            id,
            text: text.get(id) ?? '',
            ok: result.perStep[n] === 'ok',
          })),
          correct: activity.steps.map((step) => step.text),
        },
        components: { perStep: result.perStep },
        numericReason: null,
        missing: [],
      };
    }
    case 'open': {
      const ids = new Set(activity.units.map((unit) => unit.id));
      const covered = [...new Set(marked)].filter((id) => ids.has(id));
      return {
        proposed: verdictFromUnits(covered.length, activity.units.length),
        detail: { type: 'open', units: activity.units.map((unit) => ({ ...unit })) },
        components: {
          units: activity.units.map((unit) => ({
            id: unit.id,
            state: covered.includes(unit.id) ? 'covered' : 'missing',
          })),
        },
        numericReason: null,
        missing: activity.units.filter((unit) => !covered.includes(unit.id)).map((u) => u.text),
      };
    }
  }
}

export function createActivitiesStore(db: ReteniaDatabase, clock: Clock): ActivitiesStore {
  const { orm } = db;

  function versionOf(tx: Writer, versionId: string): VersionRow {
    const version = tx.select().from(cardVersions).where(eq(cardVersions.id, versionId)).get();
    if (!version) {
      throw new CardNotFoundError();
    }
    return version;
  }

  function attemptOf(tx: Writer, attemptId: string): StoredAttempt {
    const row = tx
      .select({
        id: observations.id,
        kind: observations.kind,
        payload: observations.payload,
        schemaVersion: observations.schemaVersion,
      })
      .from(observations)
      .where(eq(observations.id, attemptId))
      .get();
    if (row?.kind !== 'attempt.submitted') {
      throw new AttemptNotFoundError();
    }
    return { ...readPayload('attempt.submitted', row.schemaVersion, row.payload), id: row.id };
  }

  function evaluationsOf(tx: Writer, attemptId: string) {
    return tx.select().from(evaluations).where(eq(evaluations.attemptId, attemptId)).all();
  }

  function partsOf(attempt: StoredAttempt, verdict: Verdict, evaluated: Evaluated): ResultParts {
    return resultParts({
      type: attempt.activityType,
      verdict,
      used: attempt.help,
      optionsQuestion: attempt.optionsQuestion,
      numericReason: evaluated.numericReason,
    });
  }

  const nextDayOf = (tx: Writer, cardId: string) => cardOf(tx, cardId).nextReviewDay;

  function markedOf(components: string | null): string[] {
    if (components === null) {
      return [];
    }
    const parsed = JSON.parse(components) as { units?: { id: string; state: string }[] };
    return (parsed.units ?? []).filter((unit) => unit.state === 'covered').map((unit) => unit.id);
  }

  // La versión 1 de la evaluación, si todavía no estaba. Devuelve la vigente.
  function ensureEvaluated(
    tx: Writer,
    attempt: StoredAttempt,
    verdict: Verdict | undefined,
    marked: readonly string[] | undefined,
  ) {
    const existing = currentEvaluation(evaluationsOf(tx, attempt.id));
    if (existing) {
      return existing;
    }
    const version = versionOf(tx, attempt.versionId);
    const evaluated = evaluate(version, attempt.answer, marked);
    const chosen = verdict ?? evaluated.proposed;
    if (!canSetVerdict(evaluated.proposed, chosen)) {
      throw new VerdictAboveProposalError();
    }
    const byRule = attempt.activityType !== 'open' && chosen === evaluated.proposed;
    appendEvaluation(tx, clock, {
      attemptId: attempt.id,
      verdict: chosen,
      source: byRule ? 'rule' : 'user',
      proposedVerdict: evaluated.proposed,
      rubricVersion: RUBRIC[attempt.activityType],
      contentVersionId: attempt.versionId,
      components: evaluated.components,
      engineSignal: engineSignal({
        verdict: chosen,
        helpLevel: attempt.helpLevel,
        optionsQuestion: attempt.optionsQuestion,
      }),
      cause: 'graded',
    });
    recomputeCardSchedule(tx, attempt.cardId);
    const saved = currentEvaluation(evaluationsOf(tx, attempt.id));
    if (!saved) {
      throw new AttemptNotFoundError();
    }
    return saved;
  }

  // Una versión nueva de la tarjeta con algo cambiado (una variante, un orden aceptado o el estado
  // de la ficha). Es del sistema: se deshace desde el aviso, no desde «Actividad reciente».
  function writeVersion(
    tx: Writer,
    cardId: string,
    change: (previous: VersionRow) => Partial<VersionRow>,
    cause: 'appeal' | 'undo',
  ): string {
    const current = activeCard(tx, cardId);
    const previous = versionOf(tx, current.versionId);
    const versionId = newId();
    tx.insert(cardVersions)
      .values({
        ...previous,
        ...change(previous),
        id: versionId,
        createdAt: clock.now().toISOString(),
        cause,
      })
      .run();
    tx.update(cards).set({ currentVersionId: versionId }).where(eq(cards.id, cardId)).run();
    appendOperation(tx, clock, {
      kind: 'card.edit',
      entityId: cardId,
      versionBeforeId: current.versionId,
      versionAfterId: versionId,
      source: 'system',
    });
    return versionId;
  }

  function amendedRow(tx: Writer, amendmentId: string) {
    const row = tx
      .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
      .from(observations)
      .where(
        and(
          eq(observations.kind, 'evaluation.amended'),
          sql`json_extract(${observations.payload}, '$.amendmentId') = ${amendmentId}`,
        ),
      )
      .get();
    if (!row) {
      throw new AmendmentNotFoundError();
    }
    return readPayload('evaluation.amended', row.schemaVersion, row.payload);
  }

  function closedAmendments(tx: Writer, cardId: string): Set<string> {
    return new Set(
      tx
        .select({ payload: observations.payload })
        .from(observations)
        .where(
          and(
            eq(observations.cardId, cardId),
            sql`${observations.kind} in ('evaluation.amendment_undone', 'evaluation.amendment_acknowledged')`,
          ),
        )
        .all()
        .map((row) => String((JSON.parse(row.payload) as { amendmentId: string }).amendmentId)),
    );
  }

  return {
    start({ cardId, openingId }) {
      const row = activeCard(orm, cardId);
      assertPracticable(row);
      const activity = parsedActivity(row);
      const sheet = sheetOf(row);
      const mode = asMode(row.mode);
      const base = {
        submitted: false,
        mode,
        hints: sheet.hints.length,
        hasExample: row.example.trim() !== '',
        hasSource: sheet.source.trim() !== '' || row.sourceCite !== null,
        used: [],
      };
      const input = ((): ActivityOpening['input'] => {
        switch (activity?.type) {
          case undefined:
            return { type: 'card' };
          case 'short':
          case 'open':
            return { type: activity.type };
          case 'numeric':
            return { type: 'numeric', unit: activity.unit };
          case 'options': {
            const byId = new Map(activity.options.map((option) => [option.id, option.text]));
            return {
              type: 'options',
              options: shuffledOptions([...byId.keys()], openingId).map((id) => ({
                id,
                text: byId.get(id) ?? '',
              })),
            };
          }
          case 'order': {
            const byId = new Map(activity.steps.map((step) => [step.id, step.text]));
            return {
              type: 'order',
              steps: initialOrder([...byId.keys()], openingId).map((id) => ({
                id,
                text: byId.get(id) ?? '',
              })),
            };
          }
        }
      })();
      return {
        cardId,
        question: row.question,
        mode,
        label: modeLabel({ mode, used: [], attemptNo: 1 }),
        input,
        availability: {
          idle: helpAvailability({ ...base, started: false }),
          started: helpAvailability({ ...base, started: true }),
          retry: helpAvailability({ ...base, mode: 'practice', started: true }),
        },
        hints: Math.min(3, sheet.hints.length),
      };
    },

    help({ cardId, kind, used, confirmed, attemptNo }) {
      const row = activeCard(orm, cardId);
      const sheet = sheetOf(row);
      // Un reintento ya es práctica, aunque la actividad sea una evaluación.
      const mode = attemptNo > 1 ? 'practice' : asMode(row.mode);
      const state = {
        started: true,
        submitted: false,
        mode,
        hints: sheet.hints.length,
        hasExample: row.example.trim() !== '',
        hasSource: sheet.source.trim() !== '' || row.sourceCite !== null,
        used,
      };
      const available = helpAvailability(state);
      const label = (use: HelpUse) => modeLabel({ mode, used: [...used, use], attemptNo });
      if (kind === 'hint' || kind === 'solution') {
        if (!available.hint && attemptNo === 1) {
          throw new HelpNotAvailableError();
        }
        const next = kind === 'hint' ? nextHint(state) : { kind: 'confirmSolution' as const };
        if (next.kind === 'hint') {
          const use = { kind: 'hint' as const, level: next.level, index: next.index };
          return {
            kind: 'help',
            use,
            label: label(use),
            content: { kind: 'hint', index: next.index, text: sheet.hints[next.index] ?? '' },
          };
        }
        if (confirmed !== true) {
          return { kind: 'confirmSolution' };
        }
        const activity = parsedActivity(row);
        const use = { kind: 'solution' as const, level: 'A4' as const };
        const solution = ((): Extract<ActivityHelp, { kind: 'help' }>['content'] => {
          switch (activity?.type) {
            case 'order':
              return {
                kind: 'solution',
                solution: { type: 'order', steps: activity.steps.map((step) => step.text) },
              };
            case 'open':
              return {
                kind: 'solution',
                solution: { type: 'open', units: activity.units.map((unit) => unit.text) },
              };
            default:
              return {
                kind: 'solution',
                solution: { type: activity?.type ?? 'card', answer: row.answer },
              };
          }
        })();
        return { kind: 'help', use, label: label(use), content: solution };
      }
      if (kind === 'example') {
        if (!available.example) {
          throw new HelpNotAvailableError();
        }
        const use = { kind: 'example' as const, level: 'A3' as const };
        return {
          kind: 'help',
          use,
          label: label(use),
          content: { kind: 'example', text: row.example },
        };
      }
      if (!available.source) {
        throw new HelpNotAvailableError();
      }
      const cite = describeCite(orm, row.sourceCite, row.id);
      const use = { kind: 'source' as const, level: 'A2' as const };
      return {
        kind: 'help',
        use,
        label: label(use),
        content: {
          kind: 'source',
          text: sheet.source,
          cite:
            cite === null
              ? null
              : {
                  materialId: cite.materialId,
                  reference: cite.reference,
                  quote: cite.quote,
                  status: cite.status,
                },
        },
      };
    },

    submit(input) {
      return orm.transaction((tx) => {
        const row = activeCard(tx, input.cardId);
        assertPracticable(row);
        const activity = exerciseOf(row);
        const mode = asMode(row.mode);
        const evaluated = evaluate(row, input.answer);
        const help = input.help.map((use) => ({ ...use }));
        const observation = appendObservation(tx, clock, {
          kind: 'attempt.submitted',
          payload: {
            cardId: input.cardId,
            versionId: row.versionId,
            activityType: activity.type,
            openingId: input.openingId,
            attemptNo: input.attemptNo,
            rule: 'chosen',
            purpose: purposeOf({ mode, used: help, attemptNo: input.attemptNo }),
            answer: input.answer,
            help,
            helpLevel: maxHelpLevel(help),
            noIdea: input.noIdea,
            optionsQuestion: activity.type === 'options',
            confidence: null,
            shownAt: input.shownAt,
            firstInputMs: input.firstInputMs,
            submittedMs: input.submittedMs,
          },
          idempotencyKey: `attempt:${input.attemptId}`,
          source: 'user',
        });
        const attempt = attemptOf(tx, observation.id);
        if (attempt.cardId !== input.cardId) {
          throw new AttemptConflictError();
        }
        return {
          attemptId: observation.id,
          proposed: evaluated.proposed,
          allowed: allowedVerdicts(evaluated.proposed),
          parts: partsOf(attempt, evaluated.proposed, evaluated),
          missing: evaluated.missing,
          detail: evaluated.detail,
          explanation: sheetOf(row).explanation,
        };
      });
    },

    propose({ attemptId, marked, verdict }) {
      const attempt = attemptOf(orm, attemptId);
      const evaluated = evaluate(versionOf(orm, attempt.versionId), attempt.answer, marked);
      // Nunca más alto que lo propuesto: un resultado elegido de más queda en lo propuesto.
      const shown =
        verdict !== undefined && canSetVerdict(evaluated.proposed, verdict)
          ? verdict
          : evaluated.proposed;
      return {
        proposed: evaluated.proposed,
        allowed: allowedVerdicts(evaluated.proposed),
        parts: partsOf(attempt, shown, evaluated),
        missing: evaluated.missing,
      };
    },

    finalize({ attemptId, verdict, marked }) {
      return orm.transaction((tx) => {
        const attempt = attemptOf(tx, attemptId);
        const saved = ensureEvaluated(tx, attempt, verdict, marked);
        const evaluated = evaluate(
          versionOf(tx, attempt.versionId),
          attempt.answer,
          markedOf(saved.components),
        );
        const final = saved.verdict as Verdict;
        const nextReviewDay = nextDayOf(tx, attempt.cardId);
        const pendingCheck = pendingCheckOf(tx, attempt.cardId);
        return {
          verdict: final,
          parts: partsOf(attempt, final, evaluated),
          nextReviewDay,
          pendingCheck,
          checkDay: pendingCheck ? nextReviewDay : null,
        };
      });
    },

    appeal({ attemptId, reason, verdict, marked }) {
      return orm.transaction((tx): AppealResult => {
        const attempt = attemptOf(tx, attemptId);
        const before = ensureEvaluated(tx, attempt, verdict, marked);
        if (reason === 'reference_incomplete') {
          appendObservation(tx, clock, {
            kind: 'attempt.appealed',
            payload: { cardId: attempt.cardId, attemptId, reason },
            idempotencyKey: `appeal:${attemptId}:${newId()}`,
            source: 'user',
          });
          const field = (
            {
              short: 'variants',
              numeric: 'numeric',
              options: 'options',
              order: 'steps',
              open: 'units',
            } as const
          )[attempt.activityType];
          return { kind: 'editor', field };
        }
        const card = activeCard(tx, attempt.cardId);
        const dueBefore = nextDayOf(tx, attempt.cardId);
        const amendmentId = newId();
        let addedVariant: string | null = null;
        let addedOrder: string[] | null = null;
        let previousSheetState: string | null = null;
        const beforeVerdict = before.verdict as Verdict;
        let after: AmendmentNotice['after'] = 'notCounted';
        if (reason === 'answer_correct') {
          const version = versionOf(tx, card.versionId);
          const answer = attempt.answer;
          if (answer.type === 'short' || answer.type === 'numeric') {
            const text = (answer.type === 'short' ? answer.text : answer.raw).trim();
            const known = [version.answer, ...listOf(version.variants)].map(normalizeShortAnswer);
            if (text !== '' && !known.includes(normalizeShortAnswer(text))) {
              addedVariant = text;
              writeVersion(
                tx,
                attempt.cardId,
                (previous) => ({ variants: JSON.stringify([...listOf(previous.variants), text]) }),
                'appeal',
              );
            }
          } else if (answer.type === 'order') {
            const activity = exerciseOf(version);
            if (activity.type === 'order') {
              addedOrder = [...answer.stepIds];
              const order = addedOrder;
              writeVersion(
                tx,
                attempt.cardId,
                () => ({
                  activity: JSON.stringify({
                    ...activity,
                    acceptedOrders: [...activity.acceptedOrders, order],
                  }),
                }),
                'appeal',
              );
            }
          }
          const latest = activeCard(tx, attempt.cardId);
          const reevaluated = evaluate(
            versionOf(tx, latest.versionId),
            attempt.answer,
            markedOf(before.components),
          );
          const byRule = reevaluated.proposed === 'correct' && attempt.activityType !== 'open';
          appendEvaluation(tx, clock, {
            attemptId,
            verdict: 'correct',
            source: byRule ? 'rule' : 'user',
            proposedVerdict: before.proposedVerdict as Verdict | null,
            rubricVersion: RUBRIC[attempt.activityType],
            contentVersionId: latest.versionId,
            components: reevaluated.components,
            engineSignal: engineSignal({
              verdict: 'correct',
              helpLevel: attempt.helpLevel,
              optionsQuestion: attempt.optionsQuestion,
            }),
            cause: 'appeal',
            appealReason: reason,
            amendmentId,
          });
          after = 'correct';
        } else {
          previousSheetState = card.sheetState === 'in_review' ? null : card.sheetState;
          flagCardVersion(tx, clock, attempt.cardId);
          // «Ambigua»: ese intento. «Incorrecta»: todos los intentos evaluados de la tarjeta.
          const targets =
            reason === 'ambiguous'
              ? [attemptId]
              : tx
                  .select({ id: observations.id })
                  .from(observations)
                  .where(
                    and(
                      eq(observations.cardId, attempt.cardId),
                      sql`${observations.kind} in ('attempt.submitted', 'review.graded')`,
                    ),
                  )
                  .all()
                  .map((row) => row.id);
          for (const target of targets) {
            const current = currentEvaluation(evaluationsOf(tx, target));
            if (current === null || current.affected === 1) {
              continue;
            }
            appendEvaluation(tx, clock, {
              attemptId: target,
              verdict: current.verdict as Verdict,
              source: 'user',
              proposedVerdict: current.proposedVerdict as Verdict | null,
              rubricVersion: current.rubricVersion,
              contentVersionId: current.contentVersionId,
              components: current.components === null ? undefined : JSON.parse(current.components),
              engineSignal: current.engineSignal as 'again' | 'hard' | 'good' | null,
              cause: reason === 'ambiguous' ? 'appeal' : 'reference_incorrect',
              appealReason: reason,
              affected: true,
              amendmentId,
            });
          }
        }
        recomputeCardSchedule(tx, attempt.cardId);
        const dueAfter = nextDayOf(tx, attempt.cardId);
        appendObservation(tx, clock, {
          kind: 'evaluation.amended',
          payload: {
            cardId: attempt.cardId,
            attemptId,
            amendmentId,
            reason,
            before: beforeVerdict,
            after,
            dueBefore,
            dueAfter,
            addedVariant,
            addedOrder,
            previousSheetState,
          },
          idempotencyKey: `amend:${amendmentId}`,
          source: 'user',
        });
        const final = (currentEvaluation(evaluationsOf(tx, attemptId))?.verdict ??
          beforeVerdict) as Verdict;
        const evaluated = evaluate(
          versionOf(tx, attempt.versionId),
          attempt.answer,
          markedOf(before.components),
        );
        return {
          kind: 'amended',
          notice: {
            amendmentId,
            cardId: attempt.cardId,
            attemptId,
            reason,
            before: beforeVerdict,
            after,
            dueBefore,
            dueAfter,
            inReview: reason !== 'answer_correct',
          },
          verdict: final,
          parts: partsOf(attempt, final, evaluated),
        };
      });
    },

    undoAmendment({ amendmentId }) {
      return orm.transaction((tx) => {
        const amended = amendedRow(tx, amendmentId);
        const attempt = attemptOf(tx, amended.attemptId);
        const undone = tx
          .select({ id: observations.id })
          .from(observations)
          .where(eq(observations.idempotencyKey, `undo-amend:${amendmentId}`))
          .get();
        if (undone === undefined) {
          const written = tx
            .select()
            .from(evaluations)
            .where(eq(evaluations.amendmentId, amendmentId))
            .all();
          for (const row of written) {
            const previous = tx
              .select()
              .from(evaluations)
              .where(eq(evaluations.id, row.supersedesId ?? ''))
              .get();
            if (!previous) {
              continue;
            }
            appendEvaluation(tx, clock, {
              attemptId: row.attemptId,
              verdict: previous.verdict as Verdict,
              source: 'user',
              proposedVerdict: previous.proposedVerdict as Verdict | null,
              rubricVersion: previous.rubricVersion,
              contentVersionId: previous.contentVersionId,
              components:
                previous.components === null ? undefined : JSON.parse(previous.components),
              engineSignal: previous.engineSignal as 'again' | 'hard' | 'good' | null,
              cause: 'undo',
              appealReason: previous.appealReason,
              affected: previous.affected === 1,
              undoesAmendmentId: amendmentId,
            });
          }
          const card = activeCard(tx, amended.cardId);
          const restoreState =
            amended.previousSheetState !== null && card.sheetState === 'in_review';
          if (amended.addedVariant !== null || amended.addedOrder !== null || restoreState) {
            writeVersion(
              tx,
              amended.cardId,
              (previous) => {
                const change: Partial<VersionRow> = {};
                if (amended.addedVariant !== null) {
                  const variant = amended.addedVariant;
                  change.variants = JSON.stringify(
                    listOf(previous.variants).filter((item) => item !== variant),
                  );
                }
                if (amended.addedOrder !== null && previous.activity !== null) {
                  const activity = exerciseOf(previous);
                  const order = amended.addedOrder.join(',');
                  if (activity.type === 'order') {
                    change.activity = JSON.stringify({
                      ...activity,
                      acceptedOrders: activity.acceptedOrders.filter(
                        (accepted) => accepted.join(',') !== order,
                      ),
                    });
                  }
                }
                if (restoreState && amended.previousSheetState !== null) {
                  change.sheetState = amended.previousSheetState;
                }
                return change;
              },
              'undo',
            );
          }
          recomputeCardSchedule(tx, amended.cardId);
          appendObservation(tx, clock, {
            kind: 'evaluation.amendment_undone',
            payload: { cardId: amended.cardId, amendmentId },
            idempotencyKey: `undo-amend:${amendmentId}`,
            source: 'user',
          });
        }
        const current = currentEvaluation(evaluationsOf(tx, attempt.id));
        return {
          verdict: (current?.verdict ?? amended.before) as Verdict,
          nextReviewDay: nextDayOf(tx, amended.cardId),
        };
      });
    },

    acknowledge({ amendmentId }) {
      orm.transaction((tx) => {
        const amended = amendedRow(tx, amendmentId);
        appendObservation(tx, clock, {
          kind: 'evaluation.amendment_acknowledged',
          payload: { cardId: amended.cardId, amendmentId },
          idempotencyKey: `ack-amend:${amendmentId}`,
          source: 'user',
        });
      });
    },

    notices({ cardId }) {
      const closed = closedAmendments(orm, cardId);
      const sheetState = activeCard(orm, cardId).sheetState;
      return orm
        .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
        .from(observations)
        .where(and(eq(observations.cardId, cardId), eq(observations.kind, 'evaluation.amended')))
        .all()
        .map((row) => readPayload('evaluation.amended', row.schemaVersion, row.payload))
        .filter((amended) => !closed.has(amended.amendmentId))
        .map((amended) => ({
          amendmentId: amended.amendmentId,
          cardId: amended.cardId,
          attemptId: amended.attemptId,
          reason: amended.reason,
          before: amended.before,
          after: amended.after,
          dueBefore: amended.dueBefore,
          dueAfter: amended.dueAfter,
          inReview: amended.reason !== 'answer_correct' && sheetState === 'in_review',
        }));
    },
  };
}
