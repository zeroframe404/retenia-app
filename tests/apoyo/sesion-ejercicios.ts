import { randomUUID } from 'node:crypto';
import type { Space } from './espacio';

// Lo que comparten las pruebas de los ejercicios en la sesión de Estudiar: manejar la sesión y
// contestar un ejercicio como lo hace la ventana (cada envío dice desde qué sesión salió).

export type Current = NonNullable<ReturnType<Space['workspace']['study']['view']>['current']>;
type Reply = Parameters<Space['workspace']['activities']['submit']>[0]['answer'];

export function startSession(space: Space, minutes: 5 | 10 | 25 | 45 = 25) {
  const sessionId = randomUUID();
  const view = space.workspace.study.start({ sessionId, minutes });
  return { sessionId, view };
}

export const currentOf = (space: Space, sessionId: string): Current => {
  const { current } = space.workspace.study.view({ sessionId });
  if (!current) {
    throw new Error('La sesión no tiene actividad actual');
  }
  return current;
};

export function gradeCard(space: Space, sessionId: string, current: Current) {
  return space.workspace.study.grade({
    sessionId,
    activityId: current.activityId,
    attemptId: randomUUID(),
    grade: 'good',
    answer: null,
    activeMs: 1000,
  });
}

// Califica tarjetas hasta que la actividad actual sea un ejercicio (o uno en particular).
export function untilExercise(space: Space, sessionId: string, cardId?: string): Current {
  for (let turn = 0; turn < 200; turn += 1) {
    const current = currentOf(space, sessionId);
    if (current.card.activityType === null) {
      gradeCard(space, sessionId, current);
    } else if (cardId === undefined || current.cardId === cardId) {
      return current;
    } else {
      space.workspace.study.skip({ sessionId, activityId: current.activityId });
    }
  }
  throw new Error('No apareció el ejercicio');
}

function replyFor(space: Space, cardId: string, right: boolean): Reply {
  const detail = space.workspace.cards.get({ cardId });
  const activity = detail.activity;
  if (activity?.type === 'numeric') {
    return { type: 'numeric', raw: right ? String(activity.value).replace('.', ',') : '999999' };
  }
  if (activity?.type === 'decision') {
    const option = activity.options.find((item) => item.correct === right);
    return {
      type: 'decision',
      optionId: option?.id ?? '',
      shown: activity.options.map((item) => item.id),
    };
  }
  if (activity?.type === 'short') {
    return { type: 'short', text: right ? detail.answer : 'cualquier cosa' };
  }
  if (activity?.type === 'open') {
    return { type: 'open', text: 'Lo que me acuerdo.' };
  }
  throw new Error(`No sé contestar un ${activity?.type}`);
}

// «Enviar» y, salvo que se diga que no, salir del resultado guardándolo. Con `sessionId`, desde la
// sesión; sin él, como «Practicar ahora».
export function answer(
  space: Space,
  cardId: string,
  {
    right = true,
    sessionId,
    finalize = true,
    text,
  }: {
    right?: boolean;
    sessionId?: string | undefined;
    finalize?: boolean;
    text?: string;
  } = {},
) {
  const openingId = randomUUID();
  space.workspace.activities.start({ cardId, openingId });
  const result = space.workspace.activities.submit({
    cardId,
    openingId,
    attemptId: randomUUID(),
    attemptNo: 1,
    answer: text === undefined ? replyFor(space, cardId, right) : { type: 'short', text },
    help: [],
    noIdea: false,
    shownAt: space.clock.now().toISOString(),
    firstInputMs: 1000,
    submittedMs: 2000,
    ...(sessionId === undefined ? {} : { studySessionId: sessionId }),
  });
  const save = () =>
    space.workspace.activities.finalize({
      attemptId: result.attemptId,
      verdict: result.proposed,
      marked: [],
    });
  if (finalize) {
    save();
  }
  return { attemptId: result.attemptId, proposed: result.proposed, save };
}

export const done = (space: Space, sessionId: string, activityId: string) =>
  space.workspace.study.exerciseDone({ sessionId, activityId, activeMs: 30_000 });

export const nextReview = (space: Space, cardId: string) =>
  space.workspace.cards.get({ cardId }).nextReviewDay;

export const resultsOf = (space: Space, sessionId: string) =>
  space.workspace.study.summary({ sessionId }).results;
