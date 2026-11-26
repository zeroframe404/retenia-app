import { and, eq, inArray } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import { seedNumber } from '../core/evaluation';
import {
  MICRO_ITEMS,
  MICRO_MIN_ITEMS,
  type MicroEvent,
  type MicroPoint,
  projectMicro,
  proposableMicro,
  sessionPasses,
} from '../core/micro';
import { checkStep, type ResolvedStep, resolveSteps } from '../core/procedure';
import { studyDayOf } from '../core/study-day';
import {
  evaluateFormula,
  generateVariant,
  renderTemplate,
  type VariantFamily,
  variantCount,
} from '../core/variants';
import type {
  MicroCheck,
  MicroExercise,
  MicroProposal,
  MicroResult,
} from '../preload/contract/procedures';
import { parsedActivity } from './cards';
import { activeCard, type CardRow, findCard } from './content';
import type { ReteniaDatabase } from './database';
import { appendObservation, readPayload, type StoredPayload } from './ledger';
import type { Writer } from './orm';
import { stepStatesOf } from './procedures';
import { cardVersions, evaluations, observations } from './schema';

// El micro-ejercicio (Fase 18, CA-166). Un «punto» es un paso de un procedimiento o la cuenta de un
// numérico con variantes: son los errores de los que Retenia puede armar de 5 a 10 ítems distintos
// sin inventar contenido. Todo sale del historial.

class MicroError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MicroError';
  }
}

const ANSWER = 'answer';
const pointKey = (cardId: string, stepId: string | null) => `${cardId}:${stepId ?? ANSWER}`;
const splitKey = (key: string): { cardId: string; stepId: string | null } => {
  const at = key.indexOf(':');
  const stepId = key.slice(at + 1);
  return { cardId: key.slice(0, at), stepId: stepId === ANSWER ? null : stepId };
};

const KINDS = ['attempt.submitted', 'micro.finished'];

// Los eventos de los puntos: cada intento con variantes (los pasos que se completaron y los que
// salieron mal) y cada sesión terminada del micro-ejercicio. `cardId`: solo los de esa tarjeta.
export function microEvents(db: Writer, cardId?: string): MicroEvent[] {
  const where =
    cardId === undefined
      ? inArray(observations.kind, KINDS)
      : and(eq(observations.cardId, cardId), inArray(observations.kind, KINDS));
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
    .where(where)
    .orderBy(observations.seq)
    .all();
  const versions = db
    .select({
      attemptId: evaluations.attemptId,
      id: evaluations.id,
      version: evaluations.version,
      components: evaluations.components,
      affected: evaluations.affected,
      verdict: evaluations.verdict,
    })
    .from(evaluations)
    .innerJoin(observations, eq(observations.id, evaluations.attemptId))
    .where(where)
    .all();
  const events: MicroEvent[] = [];
  for (const row of rows) {
    const studyDay = studyDayOf(new Date(row.at));
    if (row.kind === 'micro.finished') {
      const session = readPayload('micro.finished', row.schemaVersion, row.payload);
      events.push({
        kind: 'session',
        id: row.id,
        seq: row.seq,
        point: pointKey(session.cardId, session.stepId),
        studyDay,
        items: session.items,
      });
      continue;
    }
    const attempt = readPayload('attempt.submitted', row.schemaVersion, row.payload);
    if (attempt.variant === undefined) {
      continue;
    }
    const own = versions.filter((version) => version.attemptId === row.id);
    const problem = `${attempt.cardId}:${attempt.variant.n}`;
    // Primero «apareció en una actividad completa» y después el error, con el mismo número.
    const add = (point: string, failed: boolean) => {
      events.push({ kind: 'practiced', id: `${row.id}:0:${point}`, seq: row.seq, point, studyDay });
      if (failed) {
        events.push({
          kind: 'error',
          id: `${row.id}:1:${point}`,
          seq: row.seq,
          point,
          studyDay,
          problem,
        });
      }
    };
    if (attempt.activityType === 'procedure') {
      for (const step of stepStatesOf(own) ?? []) {
        add(pointKey(attempt.cardId, step.id), step.state !== 'ok');
      }
    } else if (attempt.activityType === 'numeric') {
      const current = [...own].sort((a, b) => b.version - a.version)[0];
      if (current !== undefined && current.affected !== 1) {
        add(pointKey(attempt.cardId, null), current.verdict === 'incorrect');
      }
    }
  }
  return events;
}

// Los pasos de un procedimiento cuyo micro-ejercicio ya superaste y todavía no volvieron.
export function pendingReturnSteps(db: Writer, cardId: string): string[] {
  return [...projectMicro(microEvents(db, cardId)).values()].flatMap((point) => {
    const { stepId } = splitKey(point.point);
    return point.pendingReturn && stepId !== null ? [stepId] : [];
  });
}

interface Source {
  readonly row: CardRow;
  readonly family: VariantFamily;
  readonly stepId: string | null;
}

// De dónde salen los ítems de un punto (nulo si ya no se puede armar: la tarjeta no se practica,
// no tiene suficientes variantes o el paso ya no existe).
function sourceOf(db: Writer, key: string): Source | null {
  const { cardId, stepId } = splitKey(key);
  const row = findCard(db, cardId);
  if (
    !row ||
    row.deletedAt !== null ||
    row.pausedAt !== null ||
    row.sheetState === 'in_review' ||
    row.sheetState === 'retired'
  ) {
    return null;
  }
  const activity = parsedActivity(row);
  const family =
    activity?.type === 'procedure'
      ? activity.family
      : activity?.type === 'numeric'
        ? (activity.family ?? null)
        : null;
  if (!family || variantCount(family) < MICRO_MIN_ITEMS) {
    return null;
  }
  if (activity?.type === 'procedure' && !activity.steps.some((step) => step.id === stepId)) {
    return null;
  }
  return { row, family, stepId };
}

export interface MicroStore {
  proposal(): { proposal: MicroProposal | null };
  open(input: { microId: string; pointKey: string }): MicroExercise;
  check(input: { microId: string; index: number; written: string }): MicroCheck;
  self(input: { microId: string; index: number; ok: boolean }): void;
  finish(input: { microId: string }): MicroResult;
  // El estado de un punto (lo usan las pruebas).
  point(key: string): MicroPoint | null;
}

type Started = StoredPayload<'micro.started'>;

export function createMicroStore(db: ReteniaDatabase, clock: Clock): MicroStore {
  const { orm } = db;

  function startedOf(tx: Writer, microId: string): Started | null {
    const row = tx
      .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
      .from(observations)
      .where(eq(observations.idempotencyKey, `micro:${microId}`))
      .get();
    return row ? readPayload('micro.started', row.schemaVersion, row.payload) : null;
  }

  function requireStarted(tx: Writer, microId: string): Started {
    const started = startedOf(tx, microId);
    if (!started) {
      throw new MicroError('No encontré ese micro-ejercicio');
    }
    return started;
  }

  function versionRow(tx: Writer, versionId: string) {
    const row = tx
      .select({
        question: cardVersions.question,
        activity: cardVersions.activity,
        explanation: cardVersions.explanation,
      })
      .from(cardVersions)
      .where(eq(cardVersions.id, versionId))
      .get();
    if (!row) {
      throw new MicroError('No encontré esa versión');
    }
    return row;
  }

  // El ítem `index`: el enunciado, lo ya resuelto y el paso que se completa.
  function itemOf(tx: Writer, started: Started, index: number) {
    const item = started.items[index];
    if (!item) {
      throw new MicroError('Ese ítem no existe');
    }
    const version = versionRow(tx, started.versionId);
    const activity = parsedActivity(version);
    if (activity?.type === 'procedure') {
      const steps = resolveSteps(activity, item.values);
      const at = steps.findIndex((step) => step.id === started.stepId);
      const step = steps[at] as ResolvedStep;
      return {
        title: version.question,
        stepPrompt: step.prompt,
        statement: renderTemplate(activity.family?.statements[0] ?? '', item.values),
        givens: steps.slice(0, at).map((before) => ({
          position: before.position,
          prompt: before.prompt,
          result:
            before.expected.type === 'number'
              ? textOfNumber(before.expected.value, before.expected.unit)
              : before.expected.text,
        })),
        step,
      };
    }
    if (activity?.type === 'numeric' && activity.family && activity.formula) {
      const step: ResolvedStep = {
        id: ANSWER,
        position: 1,
        prompt: version.question,
        explanation: renderTemplate(version.explanation, item.values),
        key: true,
        expected: {
          type: 'number',
          value: evaluateFormula(activity.formula, item.values),
          tolerance: activity.tolerance,
          unit: activity.unit,
        },
      };
      return {
        title: version.question,
        stepPrompt: null,
        statement: renderTemplate(activity.family.statements[0] ?? '', item.values),
        givens: [],
        step,
      };
    }
    throw new MicroError('Esa tarjeta ya no tiene variantes');
  }

  const textOfNumber = (value: number, unit: string | null) =>
    `${renderTemplate('{v}', { v: value })}${unit === null ? '' : ` ${unit}`}`;

  const expectedText = (step: ResolvedStep) =>
    step.expected.type === 'number'
      ? textOfNumber(step.expected.value, step.expected.unit)
      : step.expected.text;

  // Lo último que se anotó de cada ítem.
  function answersOf(tx: Writer, started: Started) {
    const answers = new Map<number, StoredPayload<'micro.item'>>();
    for (const row of tx
      .select({ payload: observations.payload, schemaVersion: observations.schemaVersion })
      .from(observations)
      .where(and(eq(observations.cardId, started.cardId), eq(observations.kind, 'micro.item')))
      .orderBy(observations.seq)
      .all()) {
      const payload = readPayload('micro.item', row.schemaVersion, row.payload);
      if (payload.microId === started.microId) {
        answers.set(payload.index, payload);
      }
    }
    return answers;
  }

  return {
    proposal() {
      const points = projectMicro(microEvents(orm));
      const available = new Map([...points].filter(([key]) => sourceOf(orm, key) !== null));
      const chosen = proposableMicro(available, studyDayOf(clock.now()));
      const source = chosen === null ? null : sourceOf(orm, chosen);
      if (chosen === null || source === null) {
        return { proposal: null };
      }
      const activity = parsedActivity(source.row);
      const step =
        activity?.type === 'procedure'
          ? (activity.steps.find((candidate) => candidate.id === source.stepId)?.prompt ?? null)
          : null;
      return {
        proposal: {
          pointKey: chosen,
          cardId: source.row.id,
          title: source.row.question,
          step,
          items: Math.min(MICRO_ITEMS, variantCount(source.family)),
        },
      };
    },

    open({ microId, pointKey: key }) {
      return orm.transaction((tx) => {
        let started = startedOf(tx, microId);
        if (!started) {
          const source = sourceOf(tx, key);
          if (!source) {
            throw new MicroError('Ese micro-ejercicio ya no está disponible');
          }
          const row = activeCard(tx, source.row.id);
          const total = variantCount(source.family);
          const count = Math.min(MICRO_ITEMS, total);
          // Otra serie que la de «Practicar ahora»: no gasta las variantes del problema.
          const seed = `${row.id}:micro`;
          const first = seedNumber(microId) % total;
          appendObservation(tx, clock, {
            kind: 'micro.started',
            payload: {
              cardId: row.id,
              versionId: row.versionId,
              microId,
              stepId: source.stepId,
              items: Array.from({ length: count }, (_, index) => {
                const n = (first + index) % total;
                return { n, values: { ...generateVariant(source.family, seed, n).values } };
              }),
            },
            idempotencyKey: `micro:${microId}`,
            source: 'user',
          });
          started = requireStarted(tx, microId);
        }
        const run = started;
        const items = run.items.map((_, index) => itemOf(tx, run, index));
        return {
          microId,
          title: items[0]?.title ?? '',
          step: items[0]?.stepPrompt ?? null,
          items: items.map((item, index) => ({
            index,
            statement: item.statement,
            givens: item.givens,
            prompt: item.step.prompt,
            answerType: item.step.expected.type,
            unit: item.step.expected.type === 'number' ? item.step.expected.unit : null,
          })),
        };
      });
    },

    check({ microId, index, written }) {
      return orm.transaction((tx) => {
        const started = requireStarted(tx, microId);
        const { step } = itemOf(tx, started, index);
        // La primera respuesta de cada ítem es la que vale.
        const before = answersOf(tx, started).get(index);
        const answered = before?.written ?? written;
        const state = checkStep(step, answered);
        const ok = before ? before.ok : state === 'self' ? null : state === 'ok';
        if (!before) {
          appendObservation(tx, clock, {
            kind: 'micro.item',
            payload: { cardId: started.cardId, microId, index, written: answered, ok },
            idempotencyKey: `micro-item:${microId}:${index}`,
            source: 'user',
          });
        }
        return { ok, expected: expectedText(step), explanation: step.explanation };
      });
    },

    self({ microId, index, ok }) {
      orm.transaction((tx) => {
        const started = requireStarted(tx, microId);
        const before = answersOf(tx, started).get(index);
        if (!before || before.ok !== null) {
          return;
        }
        appendObservation(tx, clock, {
          kind: 'micro.item',
          payload: { cardId: started.cardId, microId, index, written: before.written, ok },
          idempotencyKey: `micro-self:${microId}:${index}`,
          source: 'user',
        });
      });
    },

    finish({ microId }) {
      return orm.transaction((tx) => {
        const started = requireStarted(tx, microId);
        const answers = answersOf(tx, started);
        if (started.items.some((_, index) => answers.get(index)?.ok == null)) {
          throw new MicroError('Todavía faltan ítems');
        }
        const items = started.items.map((_, index) => ({
          ok: answers.get(index)?.ok === true,
          hinted: false,
        }));
        appendObservation(tx, clock, {
          kind: 'micro.finished',
          payload: { cardId: started.cardId, microId, stepId: started.stepId, items },
          idempotencyKey: `micro-finish:${microId}`,
          source: 'user',
        });
        const point = projectMicro(microEvents(tx, started.cardId)).get(
          pointKey(started.cardId, started.stepId),
        );
        const passed = point?.status === 'passed';
        return {
          correct: items.filter((item) => item.ok).length,
          total: items.length,
          good: sessionPasses(items),
          goodSessions: passed ? 2 : Math.min(2, point?.goodDays.length ?? 0),
          passed,
        };
      });
    },

    point(key) {
      return projectMicro(microEvents(orm)).get(key) ?? null;
    },
  };
}
