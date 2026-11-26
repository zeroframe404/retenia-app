import { and, eq, sql } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import {
  type Activity,
  allowedVerdicts,
  canSetVerdict,
  engineSignal,
  evaluateDecision,
  evaluateNumeric,
  evaluateOptions,
  evaluateOrder,
  evaluateShort,
  type HelpUse,
  helpAvailability,
  helpLevelOf,
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
import type { Diagnosis } from '../core/mastery';
import type { Verdict } from '../core/memory';
import { resolveSteps } from '../core/procedure';
import { evaluateFormula, renderTemplate, type VariantValues } from '../core/variants';
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
import { asMode, parsedActivity } from './cards';
import { activeCard, CardNotFoundError, type CardRow, cardOf, sheetOf } from './content';
import type { ReteniaDatabase } from './database';
import { diagnosisFor } from './diagnosis';
import { newId } from './ids';
import {
  appendEvaluation,
  appendObservation,
  appendOperation,
  readPayload,
  type StoredPayload,
} from './ledger';
import { describeCite } from './materials';
import type { Writer } from './orm';
import { resultText } from './procedures';
import { pendingCheckOf, recomputeCardSchedule } from './projections';
import { cards, cardVersions, evaluations, observations } from './schema';
import { assertSessionActivity } from './session-state';
import { runIncludes } from './sets';
import { stepStatesOf } from './step-states';
import { isNewVariant, showVariant, variantOfOpening } from './variants';

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
// Cuántos órdenes aceptados puede tener un «Ordenar pasos» (el tope del contrato).
const MAX_ACCEPTED_ORDERS = 20;

// Cada ayuda con el nivel que le corresponde por su tipo y su número de pista (lo que diga la
// ventana sobre el nivel no cuenta).
function normalizedHelp(used: readonly HelpUseValue[]): HelpUse[] {
  return used.map((use) => {
    const index = use.kind === 'hint' ? Math.min(2, Math.max(0, use.index ?? 0)) : undefined;
    return {
      kind: use.kind,
      level: helpLevelOf({ kind: use.kind, index }),
      ...(index === undefined ? {} : { index }),
      ...(use.atMs === undefined ? {} : { atMs: use.atMs }),
    };
  });
}

const RUBRIC: Record<Activity['type'], string> = {
  short: 'short-1',
  numeric: 'numeric-1',
  options: 'options-1',
  order: 'order-1',
  open: 'units-1',
  procedure: 'steps-1',
  decision: 'decision-1',
  interleaved: 'set-1',
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
  // Fase 18: la vuelta del conjunto intercalado en la que se resuelve.
  runId?: string | undefined;
  // La sesión de Estudiar desde la que se envía.
  studySessionId?: string | undefined;
}

export interface ActivitiesStore {
  // «Practicar ahora»: lo que hace falta para mostrar la actividad, sin la respuesta.
  start(input: { cardId: string; openingId: string }): ActivityOpening;
  // Una ayuda de la barra: la próxima pista, el ejemplo, la fuente o la solución.
  help(input: {
    cardId: string;
    openingId: string;
    kind: HelpUse['kind'];
    used: readonly HelpUseValue[];
    confirmed?: boolean | undefined;
    // Lo que cree la ventana; el principal lo calcula de los intentos de la apertura.
    attemptNo?: number | undefined;
  }): ActivityHelp;
  // «Enviar»: guarda el intento y devuelve lo que propone Retenia (todavía sin evaluación).
  submit(input: SubmitInput): SubmitResult;
  // Para la sesión de Estudiar, dentro de su transacción: guarda lo propuesto de un envío que quedó
  // sin guardar, o lo deja sin contar («La tarjeta está mal»).
  settle(tx: Writer, attemptId: string): void;
  discard(tx: Writer, attemptId: string): void;
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
type StoredAttempt = StoredPayload<'attempt.submitted'> & { id: string };

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
  answer: StoredAttempt['answer'],
  marked: readonly string[] = [],
  // En un numérico con variantes, los datos de la que se resolvió.
  values?: VariantValues,
): Evaluated {
  const activity = asVariant(exerciseOf(version), values);
  // El procedimiento y el conjunto tienen sus propios caminos (procedures.ts y sets.ts).
  if (answer.type !== activity.type || answer.type === 'procedure') {
    throw new AnswerTypeMismatchError();
  }
  const hasFamily = activity.type === 'numeric' && Boolean(activity.family);
  const variants = hasFamily ? [] : listOf(version.variants);
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
    case 'decision': {
      const chosenId = answer.type === 'decision' ? answer.optionId : '';
      const result = evaluateDecision(chosenId, activity.options);
      const correct = activity.options.find((option) => option.correct);
      return {
        proposed: result.verdict,
        detail: {
          type: 'decision',
          chosenId,
          correctId: correct?.id ?? '',
          correctText: correct?.text ?? '',
          explanation: result.explanation,
          options: activity.options.map((option) => ({
            id: option.id,
            text: option.text,
            why: option.explanation,
            correct: option.correct,
          })),
        },
        components: { chosenId, correctId: correct?.id ?? null },
        numericReason: null,
        missing: [],
      };
    }
    case 'procedure':
      throw new AnswerTypeMismatchError();
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

// Un numérico con variantes, con el resultado de la variante que se muestra.
function asVariant(activity: Activity, values: VariantValues | undefined): Activity {
  if (activity.type !== 'numeric' || !activity.family || !activity.formula || !values) {
    return activity;
  }
  return { ...activity, value: evaluateFormula(activity.formula, values) };
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

  // Fase 17 (CA-153): con «Todavía no.», qué sigue y por qué.
  function diagnosisOf(tx: Writer, attempt: StoredAttempt, verdict: Verdict): Diagnosis | null {
    if (verdict !== 'incorrect') {
      return null;
    }
    return diagnosisFor(tx, {
      id: attempt.id,
      cardId: attempt.cardId,
      written: attempt.answer.type === 'short' ? attempt.answer.text : null,
    });
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

  // Las tres líneas de un intento ya guardado. Un procedimiento no se vuelve a corregir acá.
  function savedParts(
    tx: Writer,
    attempt: StoredAttempt,
    verdict: Verdict,
    marked: readonly string[],
  ): ResultParts {
    if (attempt.activityType === 'procedure') {
      return resultParts({
        type: 'procedure',
        verdict,
        used: attempt.help,
        optionsQuestion: false,
      });
    }
    const version = versionOf(tx, attempt.versionId);
    const evaluated = evaluate(version, attempt.answer, marked, attempt.variant?.values);
    return partsOf(attempt, verdict, evaluated);
  }

  const nextDayOf = (tx: Writer, cardId: string) => cardOf(tx, cardId).nextReviewDay;

  function markedOf(components: string | null): string[] {
    if (components === null) {
      return [];
    }
    const parsed = JSON.parse(components) as { units?: { id: string; state: string }[] };
    return (parsed.units ?? []).filter((unit) => unit.state === 'covered').map((unit) => unit.id);
  }

  // Cuántos intentos ya se enviaron en esa apertura.
  function attemptsInOpening(tx: Writer, openingId: string): number {
    return tx
      .select({ id: observations.id })
      .from(observations)
      .where(
        and(
          eq(observations.kind, 'attempt.submitted'),
          sql`json_extract(${observations.payload}, '$.openingId') = ${openingId}`,
        ),
      )
      .all().length;
  }

  // Las correcciones de la tarjeta que todavía tienen su aviso abierto.
  function openAmendments(tx: Writer, cardId: string) {
    const closed = closedAmendments(tx, cardId);
    return tx
      .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
      .from(observations)
      .where(and(eq(observations.cardId, cardId), eq(observations.kind, 'evaluation.amended')))
      .all()
      .map((row) => readPayload('evaluation.amended', row.schemaVersion, row.payload))
      .filter((amended) => !closed.has(amended.amendmentId));
  }

  function closeOpenNotices(tx: Writer, cardId: string): void {
    for (const amended of openAmendments(tx, cardId)) {
      appendObservation(tx, clock, {
        kind: 'evaluation.amendment_acknowledged',
        payload: { cardId, amendmentId: amended.amendmentId },
        idempotencyKey: `ack-amend:${amended.amendmentId}`,
        source: 'system',
      });
    }
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
    const evaluated = evaluate(version, attempt.answer, marked, attempt.variant?.values);
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

  // El enunciado con los números de esta vez, en un numérico con variantes.
  function statementFor(row: CardRow, openingId: string): string | undefined {
    const activity = parsedActivity(row);
    if (activity?.type !== 'numeric' || !activity.family) {
      return undefined;
    }
    const family = activity.family;
    const shown = orm.transaction((tx) =>
      showVariant(tx, clock, { cardId: row.id, versionId: row.versionId, family, openingId }),
    );
    return renderTemplate(family.statements[0] ?? '', shown.values);
  }

  return {
    start({ cardId, openingId }) {
      const row = activeCard(orm, cardId);
      assertPracticable(row);
      const activity = parsedActivity(row);
      const statement = statementFor(row, openingId);
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
          case 'decision': {
            const byId = new Map(activity.options.map((option) => [option.id, option.text]));
            return {
              type: 'decision',
              options: shuffledOptions([...byId.keys()], openingId).map((id) => ({
                id,
                text: byId.get(id) ?? '',
              })),
            };
          }
          case 'procedure':
          case 'interleaved':
            return { type: activity.type };
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
        ...(statement === undefined ? {} : { statement }),
      };
    },

    help({ cardId, openingId, kind, used: claimed, confirmed }) {
      const row = activeCard(orm, cardId);
      const sheet = sheetOf(row);
      // El número de intento y el nivel de cada ayuda los calcula el principal: la ventana no los
      // decide (un reintento existe solo si ya se envió algo en esta apertura).
      const attemptNo = attemptsInOpening(orm, openingId) + 1;
      const used = normalizedHelp(claimed);
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
        // Con variantes, la solución es la de los números que estás viendo.
        const shown = variantOfOpening(orm, cardId, openingId);
        const solution = ((): Extract<ActivityHelp, { kind: 'help' }>['content'] => {
          switch (activity?.type) {
            case 'procedure':
              return {
                kind: 'solution',
                solution: {
                  type: 'procedure',
                  steps: resolveSteps(activity, shown?.values ?? {}).map(
                    (step) => `${step.prompt} ${resultText(step)}`,
                  ),
                },
              };
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
            case 'interleaved':
              throw new HelpNotAvailableError();
            default: {
              const computed =
                activity?.type === 'numeric' && activity.family && shown
                  ? asVariant(activity, shown.values)
                  : null;
              return {
                kind: 'solution',
                solution: {
                  type: activity?.type ?? 'card',
                  answer:
                    computed?.type === 'numeric'
                      ? `${renderTemplate('{v}', { v: computed.value })}${computed.unit === null ? '' : ` ${computed.unit}`}`
                      : row.answer,
                },
              };
            }
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

    settle(tx, attemptId) {
      ensureEvaluated(tx, attemptOf(tx, attemptId), undefined, []);
    },

    discard(tx, attemptId) {
      const attempt = attemptOf(tx, attemptId);
      const current = ensureEvaluated(tx, attempt, undefined, []);
      if (current.affected === 1) {
        return;
      }
      // La tarjeta estaba mal: ese envío queda anotado y no cuenta, así su próximo repaso vuelve
      // al de antes (CA-077).
      appendEvaluation(tx, clock, {
        attemptId: attempt.id,
        verdict: current.verdict as Verdict,
        source: 'user',
        proposedVerdict: current.proposedVerdict as Verdict | null,
        rubricVersion: RUBRIC[attempt.activityType],
        contentVersionId: attempt.versionId,
        components: current.components === null ? null : JSON.parse(current.components),
        engineSignal: engineSignal({
          verdict: current.verdict as Verdict,
          helpLevel: attempt.helpLevel,
          optionsQuestion: attempt.optionsQuestion,
        }),
        cause: 'flagged',
        affected: true,
      });
      recomputeCardSchedule(tx, attempt.cardId);
    },

    submit(input) {
      return orm.transaction((tx) => {
        const row = activeCard(tx, input.cardId);
        assertPracticable(row);
        if (input.studySessionId !== undefined) {
          assertSessionActivity(tx, input.studySessionId, input.cardId);
        }
        const activity = exerciseOf(row);
        const mode = asMode(row.mode);
        const shown =
          activity.type === 'numeric' && activity.family
            ? variantOfOpening(tx, input.cardId, input.openingId)
            : null;
        // Con variantes, solo se corrige la que se mostró.
        if (activity.type === 'numeric' && activity.family && !shown) {
          throw new HelpNotAvailableError();
        }
        const evaluated = evaluate(row, input.answer, [], shown?.values);
        if (activity.type === 'procedure' || activity.type === 'interleaved') {
          throw new AnswerTypeMismatchError();
        }
        if (input.runId !== undefined && !runIncludes(tx, input.runId, input.cardId)) {
          throw new AttemptConflictError();
        }
        const help = normalizedHelp(input.help);
        const repeated = tx
          .select({ id: observations.id })
          .from(observations)
          .where(eq(observations.idempotencyKey, `attempt:${input.attemptId}`))
          .get();
        const attemptNo = repeated
          ? attemptOf(tx, repeated.id).attemptNo
          : attemptsInOpening(tx, input.openingId) + 1;
        const observation = appendObservation(tx, clock, {
          kind: 'attempt.submitted',
          payload: {
            ...(input.studySessionId === undefined ? {} : { studySessionId: input.studySessionId }),
            cardId: input.cardId,
            versionId: row.versionId,
            activityType: activity.type,
            openingId: input.openingId,
            attemptNo,
            rule: 'chosen',
            purpose: purposeOf({ mode, used: help, attemptNo }),
            answer: input.answer,
            help,
            helpLevel: maxHelpLevel(help),
            noIdea: input.noIdea,
            optionsQuestion: activity.type === 'options' || activity.type === 'decision',
            confidence: null,
            shownAt: input.shownAt,
            firstInputMs: input.firstInputMs,
            submittedMs: input.submittedMs,
            // En un conjunto intercalado, la vuelta; con variantes, la que se resolvió.
            ...(input.runId === undefined ? {} : { sessionId: input.runId }),
            ...(shown === null || shown === undefined
              ? {}
              : {
                  variant: {
                    n: shown.n,
                    values: { ...shown.values },
                    isNew: isNewVariant(tx, input.cardId, shown.values),
                  },
                }),
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
          diagnosis: diagnosisOf(tx, attempt, evaluated.proposed),
          detail: evaluated.detail,
          explanation: sheetOf(row).explanation,
        };
      });
    },

    propose({ attemptId, marked, verdict }) {
      const attempt = attemptOf(orm, attemptId);
      const evaluated = evaluate(
        versionOf(orm, attempt.versionId),
        attempt.answer,
        marked,
        attempt.variant?.values,
      );
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
        diagnosis: diagnosisOf(orm, attempt, shown),
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
          attempt.variant?.values,
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
          diagnosis: diagnosisOf(tx, attempt, final),
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
              procedure: 'steps',
              decision: 'options',
              interleaved: 'options',
            } as const
          )[attempt.activityType];
          return { kind: 'editor', field };
        }
        const card = activeCard(tx, attempt.cardId);
        const dueBefore = nextDayOf(tx, attempt.cardId);
        const amendmentId = newId();
        // Una corrección nueva cierra los avisos abiertos de la tarjeta: solo se deshace la última,
        // así «Deshacer» siempre vuelve al estado de justo antes.
        closeOpenNotices(tx, attempt.cardId);
        let addedVariant: string | null = null;
        let addedOrder: string[] | null = null;
        let previousSheetState: string | null = null;
        const beforeVerdict = before.verdict as Verdict;
        let after: AmendmentNotice['after'] = 'notCounted';
        if (reason === 'answer_correct') {
          const version = versionOf(tx, card.versionId);
          const answer = attempt.answer;
          // Con variantes no se guarda tu respuesta como variante: la próxima trae otros números.
          if (
            attempt.variant === undefined &&
            (answer.type === 'short' || answer.type === 'numeric')
          ) {
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
            const given = answer.stepIds.join(',');
            const known =
              activity.type === 'order'
                ? [activity.steps.map((step) => step.id), ...activity.acceptedOrders].map((order) =>
                    order.join(','),
                  )
                : [];
            // Un orden que ya valía no se repite, y la lista tiene un tope.
            if (
              activity.type === 'order' &&
              !known.includes(given) &&
              activity.acceptedOrders.length < MAX_ACCEPTED_ORDERS
            ) {
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
          // En un procedimiento, todos los pasos quedan bien; en lo demás se vuelve a corregir.
          const reevaluated =
            attempt.activityType === 'procedure'
              ? {
                  proposed: before.proposedVerdict,
                  components: {
                    steps: (stepStatesOf([{ ...before, affected: 0 }]) ?? []).map((step) => ({
                      id: step.id,
                      state: 'ok',
                    })),
                  },
                }
              : evaluate(
                  versionOf(tx, latest.versionId),
                  attempt.answer,
                  markedOf(before.components),
                  attempt.variant?.values,
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
            // Un intento que ya no contaba («ambigua», «incorrecta») sigue sin contar.
            affected: before.affected === 1,
            amendmentId,
          });
          after = before.affected === 1 ? 'notCounted' : 'correct';
        } else {
          previousSheetState = card.sheetState === 'in_review' ? null : card.sheetState;
          // Del sistema: se deshace desde el aviso, no desde «Actividad reciente».
          if (card.sheetState !== 'in_review') {
            writeVersion(tx, attempt.cardId, () => ({ sheetState: 'in_review' }), 'appeal');
          }
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
          parts: savedParts(tx, attempt, final, markedOf(before.components)),
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
        // Solo se deshace una corrección con su aviso abierto (la última de la tarjeta): una
        // cerrada («Entendido», o porque vino otra encima) ya no cambia nada.
        const open = openAmendments(tx, amended.cardId).some(
          (item) => item.amendmentId === amendmentId,
        );
        if (undone === undefined && open) {
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
