import { afterEach, describe, expect, it } from 'vitest';
import { fixedStopwatch } from '../../src/core/clock';
import { handleMessage } from '../../src/main/bridge';
import { seedDemoCardCast, seedDemoOrganization } from '../../src/main/demo/seed';
import { readRows } from '../apoyo/base-cruda';
import { openBridge, type TestBridge } from '../apoyo/puente';

// Contrato de los canales de la sesión de estudio (Fase 10): del lado de la ventana, el puente;
// del otro, el manejador real del principal con una base real y el elenco. El cronómetro es fijo
// (1,5 s por medición) para que los tiempos guardados den siempre lo mismo.

const SESSION = '01969f1e-0000-4000-8000-0000000000c1';
const ATTEMPT = '01969f1e-0000-4000-8000-0000000000c2';
const RATING = '01969f1e-0000-4000-8000-0000000000c3';
const DOUBT = '01969f1e-0000-4000-8000-0000000000c4';

const bridges: TestBridge[] = [];
function bridge() {
  const opened = openBridge({ stopwatch: fixedStopwatch(1500) });
  seedDemoOrganization(opened.workspace);
  seedDemoCardCast(opened.workspace);
  bridges.push(opened);
  return opened;
}
afterEach(() => {
  for (const opened of bridges.splice(0)) {
    opened.close();
  }
});

async function rejected(handlers: TestBridge['handlers'], channel: string, request: unknown) {
  await expect(handleMessage(handlers, channel, request), JSON.stringify(request)).rejects.toThrow(
    `Petición rechazada en el canal «${channel}»`,
  );
}

describe('contrato: sesión de estudio', () => {
  it('[CA-068] empezar, ver, pausar y retomar por el puente', async () => {
    const { api } = bridge();
    expect(await api['study.overview']({})).toMatchObject({ dueCount: 60, resumable: null });
    const started = await api['study.start']({ sessionId: SESSION });
    expect(started.current?.card.question).toBe('¿Qué mide el desvío estándar?');
    expect(await api['study.pause']({ sessionId: SESSION })).toEqual({ ok: true });
    expect((await api['study.overview']({})).resumable).toEqual({
      sessionId: SESSION,
      done: 0,
      total: 10,
    });
    expect((await api['study.resume']({ sessionId: SESSION })).status).toBe('active');
    expect((await api['study.view']({ sessionId: SESSION })).progress).toEqual({
      done: 0,
      total: 10,
    });
  });

  it('[CA-069] calificar guarda los tiempos medidos por el principal y un pedido repetido no avanza', async () => {
    const { api, file } = bridge();
    const view = await api['study.start']({ sessionId: SESSION });
    const activityId = view.current?.activityId ?? '';
    await api['study.mark']({ sessionId: SESSION, activityId, mark: 'shown' });
    await api['study.mark']({ sessionId: SESSION, activityId, mark: 'firstInteraction' });
    await api['study.mark']({ sessionId: SESSION, activityId, mark: 'answerRequested' });
    const request = {
      sessionId: SESSION,
      activityId,
      attemptId: ATTEMPT,
      grade: 'good' as const,
      answer: 'cuánto se alejan',
    };
    const graded = await api['study.grade'](request);
    const repeated = await api['study.grade'](request);
    expect(graded.progress.done).toBe(1);
    expect(repeated.progress.done).toBe(1);
    const rows = readRows(
      file,
      "SELECT payload FROM observations WHERE kind = 'review.graded' AND session_id = ?",
      SESSION,
    );
    expect(rows).toHaveLength(1);
    expect(JSON.parse(String(rows[0]?.payload))).toMatchObject({
      shownAt: '2027-03-15T13:00:00.000Z',
      firstInteractionMs: 1500,
      answerRequestedMs: 1500,
      gradedMs: 1500,
      activeMs: 1500,
      answer: 'cuánto se alejan',
    });
  });

  it('[CA-067] [CA-077] deshacer, saltar, marcar y el borrador por el puente', async () => {
    const { api } = bridge();
    const view = await api['study.start']({ sessionId: SESSION });
    const first = view.current?.activityId ?? '';
    await api['study.grade']({
      sessionId: SESSION,
      activityId: first,
      attemptId: ATTEMPT,
      grade: 'hard',
      answer: null,
    });
    const undone = await api['study.undo']({ sessionId: SESSION });
    expect(undone.current?.activityId).toBe(first);
    expect(
      await api['study.saveDraft']({
        sessionId: SESSION,
        activityId: first,
        text: 'cuánto se alejan',
        answerShown: false,
      }),
    ).toEqual({ ok: true });
    expect((await api['study.view']({ sessionId: SESSION })).current?.draft.text).toBe(
      'cuánto se alejan',
    );
    const skipped = await api['study.skip']({ sessionId: SESSION, activityId: first });
    expect(skipped.current?.activityId).not.toBe(first);
    const flagged = await api['study.flag']({
      sessionId: SESSION,
      activityId: skipped.current?.activityId ?? '',
      attemptId: RATING,
    });
    expect(flagged.progress.done).toBe(1);
    expect((await api['doubts.reviews']({})).inReview).toHaveLength(1);
  });

  it('[CA-075] [CA-076] cierre, valoración, ajustes, la ayuda de teclas y la duda por el puente', async () => {
    const { api } = bridge();
    await api['study.start']({ sessionId: SESSION });
    expect(
      await api['study.rate']({ sessionId: SESSION, rating: 'easy', ratingId: RATING }),
    ).toEqual({
      ok: true,
    });
    const summary = await api['study.summary']({ sessionId: SESSION });
    expect(summary).toMatchObject({ rating: 'easy', subjectName: 'Estadística básica' });
    expect(await api['study.adjustPlan']({ sessionId: SESSION, option: 'shorter' })).toEqual({
      ok: true,
    });
    expect(await api['study.dismissShortcuts']({})).toEqual({ ok: true });
    expect((await api['study.view']({ sessionId: SESSION })).showShortcuts).toBe(false);
    await api['doubts.create']({
      doubtId: DOUBT,
      text: 'No entiendo por qué se divide por n−1',
      cardId: summary.cards[0]?.cardId ?? null,
      sessionId: SESSION,
    });
    expect((await api['doubts.reviews']({})).doubts[0]).toMatchObject({
      text: 'No entiendo por qué se divide por n−1',
      card: { question: '¿Qué mide el desvío estándar?' },
    });
  });

  it('[CA-068] cerrar la ventana pausa la sesión en curso', async () => {
    const { api } = bridge();
    await api['study.start']({ sessionId: SESSION });
    await api['window.flushed']({});
    expect((await api['study.view']({ sessionId: SESSION })).status).toBe('paused');
  });

  it('rechaza pedidos mal formados de la sesión', async () => {
    const { handlers } = bridge();
    await rejected(handlers, 'study.start', {});
    await rejected(handlers, 'study.start', { sessionId: 'no' });
    await rejected(handlers, 'study.grade', {
      sessionId: SESSION,
      activityId: SESSION,
      attemptId: ATTEMPT,
      grade: 'easy',
      answer: null,
    });
    await rejected(handlers, 'study.mark', {
      sessionId: SESSION,
      activityId: SESSION,
      mark: 'otro',
    });
    await rejected(handlers, 'study.rate', {
      sessionId: SESSION,
      rating: 'genial',
      ratingId: RATING,
    });
    await rejected(handlers, 'study.adjustPlan', { sessionId: SESSION, option: 'más' });
    await rejected(handlers, 'doubts.create', {
      doubtId: DOUBT,
      text: '   ',
      cardId: null,
      sessionId: null,
    });
    await rejected(handlers, 'study.saveDraft', {
      sessionId: SESSION,
      activityId: SESSION,
      text: 'x'.repeat(20_001),
      answerShown: false,
    });
  });
});
