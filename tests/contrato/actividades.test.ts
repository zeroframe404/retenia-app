import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { openBridge, type TestBridge } from '../apoyo/puente';

// Fase 16: los canales de las actividades validan todo lo que va y viene con Zod. La ventana no
// recibe la respuesta antes de enviar ni de confirmar que quiere ver la solución.

const bridges: TestBridge[] = [];
function bridge() {
  const opened = openBridge();
  bridges.push(opened);
  return opened;
}
afterEach(() => {
  for (const opened of bridges.splice(0)) {
    opened.close();
  }
});

const HINTS = [
  '¿Qué ciudad es la sede del gobierno?',
  'Es la de la Torre Eiffel.',
  'Empieza con P.',
];

async function shortExercise(api: TestBridge['api']) {
  return api['cards.create']({
    question: 'Capital de Francia',
    answer: 'París',
    activity: { type: 'short' },
    sheet: { hints: HINTS, explanation: 'París es la capital de Francia.' },
    example: 'La capital de Italia es Roma.',
  });
}

const submitOf = (cardId: string, openingId: string, text: string) => ({
  cardId,
  openingId,
  attemptId: randomUUID(),
  attemptNo: 1,
  answer: { type: 'short' as const, text },
  help: [],
  noIdea: false,
});

describe('contrato del puente: las actividades', () => {
  it('[CA-135] al abrir, «Pista», «Ver un ejemplo» y «Fuente» vienen apagadas hasta empezar el intento', async () => {
    const { api } = bridge();
    const card = await shortExercise(api);
    expect(card.activityType).toBe('short');
    const opened = await api['activities.start']({ cardId: card.id, openingId: randomUUID() });
    expect(opened).toMatchObject({
      question: 'Capital de Francia',
      mode: 'practice',
      label: 'autonomous',
      input: { type: 'short' },
      hints: 3,
      availability: {
        idle: { hint: false, example: false, source: false, noIdea: true },
        started: { hint: true, example: true, source: false, noIdea: false },
      },
    });
    expect(JSON.stringify(opened)).not.toContain('París');
  });

  it('[CA-136] las pistas llegan en orden y antes de la solución hace falta confirmar', async () => {
    const { api } = bridge();
    const card = await shortExercise(api);
    const used: { kind: 'hint'; level: 'A1' | 'A2' | 'A3'; index: number }[] = [];
    for (const [index, text] of HINTS.entries()) {
      const help = await api['activities.help']({
        cardId: card.id,
        openingId: randomUUID(),
        kind: 'hint',
        used,
        attemptNo: 1,
      });
      expect(help).toMatchObject({
        kind: 'help',
        label: 'help',
        content: { kind: 'hint', index, text },
      });
      if (help.kind === 'help' && help.use.kind === 'hint') {
        used.push({ kind: 'hint', level: help.use.level as 'A1', index });
      }
    }
    expect(used.map((use) => use.level)).toEqual(['A1', 'A2', 'A3']);
    const fourth = await api['activities.help']({
      cardId: card.id,
      openingId: randomUUID(),
      kind: 'hint',
      used,
      attemptNo: 1,
    });
    expect(fourth).toEqual({ kind: 'confirmSolution' });
    const solution = await api['activities.help']({
      cardId: card.id,
      openingId: randomUUID(),
      kind: 'solution',
      used,
      confirmed: true,
      attemptNo: 1,
    });
    expect(solution).toMatchObject({
      kind: 'help',
      use: { kind: 'solution', level: 'A4' },
      content: { kind: 'solution', solution: { type: 'short', answer: 'París' } },
    });
  });

  it('[CA-133] una pregunta de opciones llega con sus 3 opciones sin decir cuál es la correcta', async () => {
    const { api } = bridge();
    const card = await api['cards.create']({
      question: '¿Qué medida de centro cambia menos?',
      answer: 'La mediana',
      activity: {
        type: 'options',
        options: [
          { id: 'a', text: 'La mediana', correct: true, explanation: '' },
          { id: 'b', text: 'La media', correct: false, explanation: 'La arrastra el extremo.' },
          {
            id: 'c',
            text: 'El punto medio',
            correct: false,
            explanation: 'Depende de los extremos.',
          },
        ],
      },
    });
    const opened = await api['activities.start']({ cardId: card.id, openingId: randomUUID() });
    expect(opened.input.type).toBe('options');
    expect(JSON.stringify(opened.input)).not.toContain('correct');
    expect(JSON.stringify(opened.input)).not.toContain('arrastra');
  });

  it('[CA-133] el puente rechaza una pregunta de opciones que no tenga exactamente 3', async () => {
    const { api } = bridge();
    await expect(
      api['cards.create']({
        question: '¿Cuál?',
        answer: 'Una',
        activity: {
          type: 'options',
          options: [
            { id: 'a', text: 'Una', correct: true, explanation: '' },
            { id: 'b', text: 'Otra', correct: false, explanation: 'No.' },
          ],
        },
      }),
    ).rejects.toThrow('Petición rechazada en el canal «cards.create»');
  });

  it('[CA-134] «Enviar» devuelve el resultado propuesto en tres claves y lo que se puede elegir', async () => {
    const { api } = bridge();
    const card = await shortExercise(api);
    const openingId = randomUUID();
    await api['activities.start']({ cardId: card.id, openingId });
    const sent = await api['activities.submit'](submitOf(card.id, openingId, 'Paría'));
    expect(sent).toMatchObject({
      proposed: 'incorrect',
      allowed: ['incorrect'],
      parts: { verdict: 'incorrect', review: 'letters', action: 'explanation' },
      detail: { type: 'short', written: 'Paría', expected: 'París' },
      explanation: 'París es la capital de Francia.',
    });
  });

  it('[CA-139] «Discrepo» acepta los cuatro motivos y ningún otro', async () => {
    const { api } = bridge();
    const card = await shortExercise(api);
    for (const reason of [
      'answer_correct',
      'ambiguous',
      'reference_incomplete',
      'reference_incorrect',
    ] as const) {
      const openingId = randomUUID();
      await api['cards.edit']({
        cardId: card.id,
        question: 'Capital de Francia',
        answer: 'París',
        sheet: { state: 'reviewed' },
      });
      await api['activities.start']({ cardId: card.id, openingId });
      const sent = await api['activities.submit'](submitOf(card.id, openingId, 'Lyon'));
      const appealed = await api['activities.appeal']({
        attemptId: sent.attemptId,
        reason,
        verdict: 'incorrect',
      });
      expect(appealed.kind).toBe(reason === 'reference_incomplete' ? 'editor' : 'amended');
    }
    await expect(
      api['activities.appeal']({
        attemptId: randomUUID(),
        reason: 'no_me_gusta' as never,
      }),
    ).rejects.toThrow('Petición rechazada en el canal «activities.appeal»');
  });

  it('[CA-141] el aviso de evaluación corregida, «Entendido» y «Deshacer» pasan por el puente', async () => {
    const { api } = bridge();
    const card = await shortExercise(api);
    const openingId = randomUUID();
    await api['activities.start']({ cardId: card.id, openingId });
    const sent = await api['activities.submit'](submitOf(card.id, openingId, 'Ciudad de París'));
    const appealed = await api['activities.appeal']({
      attemptId: sent.attemptId,
      reason: 'answer_correct',
      verdict: 'incorrect',
    });
    if (appealed.kind !== 'amended') {
      throw new Error('tenía que enmendar');
    }
    expect(appealed.notice).toMatchObject({ before: 'incorrect', after: 'correct' });
    expect(await api['activities.notices']({ cardId: card.id })).toHaveLength(1);
    expect(
      await api['activities.undoAmendment']({ amendmentId: appealed.notice.amendmentId }),
    ).toMatchObject({ verdict: 'incorrect' });
    expect(await api['activities.notices']({ cardId: card.id })).toEqual([]);
    await api['activities.acknowledge']({ amendmentId: appealed.notice.amendmentId });
  });

  it('el puente rechaza un resultado o una ayuda que no existen', async () => {
    const { api } = bridge();
    await expect(
      api['activities.finalize']({ attemptId: randomUUID(), verdict: 'excelente' as never }),
    ).rejects.toThrow('Petición rechazada en el canal «activities.finalize»');
    await expect(
      api['activities.help']({
        cardId: randomUUID(),
        openingId: randomUUID(),
        kind: 'hint',
        used: [{ kind: 'hint', level: 'A5' as never, index: 0 }],
        attemptNo: 1,
      }),
    ).rejects.toThrow('Petición rechazada en el canal «activities.help»');
  });
});
