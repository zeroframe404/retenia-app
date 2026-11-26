import { randomUUID } from 'node:crypto';
import { type Clock, demoClock } from '../../src/core/clock';
import { resolveSteps } from '../../src/core/procedure';
import { formatValue } from '../../src/core/variants';
import { readRows } from './base-cruda';
import type { Space } from './espacio';

// Apoyo de las pruebas de la Fase 18: un reloj que adelanta días y «practicar» un procedimiento
// como quien estudia, con las respuestas calculadas desde la variante que se mostró.

export const PROCEDURE_TITLE = 'Calcular un intervalo de confianza para la media';
export const SET_TITLE = 'Media, mediana y moda';

export function movableClock(): Clock & { advance: (days: number) => void } {
  let offset = 0;
  return {
    now: () => demoClock(offset).now(),
    advance: (days) => {
      offset += days;
    },
  };
}

export function statistics(space: Space) {
  const subject = space.workspace.subjects
    .list()
    .subjects.find((item) => item.name === 'Estadística básica');
  if (!subject) {
    throw new Error('El elenco no tiene «Estadística básica»');
  }
  return subject;
}

export function cardNamed(space: Space, question: string) {
  const card = space.workspace.cards
    .list({ subjectId: statistics(space).id })
    .find((item) => item.question === question);
  if (!card) {
    throw new Error(`No está «${question}»`);
  }
  return card;
}

const TIMES = { shownAt: '2027-03-15T13:00:00.000Z', firstInputMs: 1000, submittedMs: 2000 };

export function open(space: Space, cardId: string) {
  const openingId = randomUUID();
  const view = space.workspace.procedures.open({ cardId, openingId });
  return { openingId, view };
}

// Las respuestas correctas de la variante que se mostró en esa apertura (los números de la base,
// las cuentas del núcleo).
export function rightAnswers(space: Space, cardId: string, openingId: string) {
  const [row] = readRows(
    space.file,
    `SELECT payload FROM observations WHERE idempotency_key = 'variant:${openingId}'`,
  );
  const values = row
    ? (JSON.parse(String(row.payload)) as { values: Record<string, number> }).values
    : {};
  const activity = space.workspace.cards.get({ cardId }).activity;
  if (activity?.type !== 'procedure') {
    throw new Error('No es un procedimiento');
  }
  return new Map(
    resolveSteps(activity, values).map((step) => [
      step.id,
      step.expected.type === 'number' ? formatValue(step.expected.value) : step.expected.text,
    ]),
  );
}

export function answersFor(
  space: Space,
  cardId: string,
  session: ReturnType<typeof open>,
  wrong: readonly string[] = [],
) {
  const right = rightAnswers(space, cardId, session.openingId);
  return session.view.steps
    .filter((step) => step.blank)
    .map((step) => ({
      stepId: step.id,
      written: wrong.includes(step.id) ? '999999' : (right.get(step.id) ?? ''),
    }));
}

export function check(
  space: Space,
  cardId: string,
  session: ReturnType<typeof open>,
  wrong: readonly string[] = [],
) {
  return space.workspace.procedures.check({
    cardId,
    openingId: session.openingId,
    attemptId: randomUUID(),
    answers: answersFor(space, cardId, session, wrong),
    help: [],
    noIdea: false,
    ...TIMES,
  });
}

// Una práctica entera: el ejemplo explicado o los pasos completados (los de `wrong`, mal) y la
// corrección terminada.
export function practice(space: Space, cardId: string, wrong: readonly string[] = []) {
  const session = open(space, cardId);
  if (session.view.rung.kind === 'example') {
    const { ladder } = space.workspace.procedures.studied({
      cardId,
      openingId: session.openingId,
      why: session.view.steps
        .filter((step) => step.key)
        .map((step) => ({ stepId: step.id, text: 'Porque mide cuánto cambia la media.' })),
    });
    return { ...session, ladder, verdict: null };
  }
  const response = check(space, cardId, session, wrong);
  const attemptId = response.kind === 'error' ? response.attemptId : response.correction.attemptId;
  const correction =
    response.kind === 'error'
      ? space.workspace.procedures.correction({ attemptId })
      : response.correction;
  const result = space.workspace.procedures.finish({
    attemptId,
    self: correction.steps
      .filter((step) => step.state === 'self')
      .map((step) => ({ stepId: step.id, ok: true })),
  });
  return { ...session, ladder: result.ladder, verdict: result.verdict };
}
