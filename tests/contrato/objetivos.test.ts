import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { openBridge, type TestBridge } from '../apoyo/puente';

// Fase 17: los canales de objetivos, «Mis errores» y «Mejorar la tarjeta» validan con Zod lo que va
// y viene: un objetivo vacío o demasiado largo, un tipo que no existe o un identificador mal escrito
// no llegan al principal.

const bridges: TestBridge[] = [];
function bridge() {
  const opened = openBridge({ withCast: 'tarjetas' });
  bridges.push(opened);
  return opened;
}
afterEach(() => {
  for (const opened of bridges.splice(0)) {
    opened.close();
  }
});

async function statistics(api: TestBridge['api']) {
  const { subjects } = await api['subjects.list']({});
  const subject = subjects.find((s) => s.name === 'Estadística básica');
  if (!subject) {
    throw new Error('El elenco no tiene «Estadística básica»');
  }
  return subject;
}

describe('contrato del puente: los objetivos', () => {
  it('[CA-143] crear, listar y abrir el panel de un objetivo', async () => {
    const { api } = bridge();
    const subject = await statistics(api);
    const objectiveId = randomUUID();
    await expect(
      api['objectives.create']({
        objectiveId,
        subjectId: subject.id,
        topicId: null,
        text: 'Interpretar un intervalo de confianza',
        conditions: null,
        kind: 'understand',
        cardIds: [],
      }),
    ).resolves.toEqual({ objectiveId, observable: true });
    const list = await api['objectives.list']({ subjectId: subject.id });
    expect(list.topics.flatMap((t) => t.objectives).map((o) => o.title)).toContain(
      'Interpretar un intervalo de confianza',
    );
    const panel = await api['objectives.panel']({ objectiveId });
    expect(panel).toMatchObject({
      objective: { id: objectiveId, state: 'not-started', kind: 'understand' },
      nextStep: { kind: 'start' },
      estimate: { outOfTen: null, observations: 0 },
    });
    // Un implícito también se abre por su tema.
    const implicit = list.topics.flatMap((t) => t.objectives).find((o) => o.implicit);
    await expect(
      api['objectives.panel']({ objectiveId: implicit?.id ?? '' }),
    ).resolves.toMatchObject({ objective: { implicit: true } });
  });

  it('[CA-143] un texto vacío o de más de 200 letras, un tipo que no existe o una referencia mal escrita se rechazan', async () => {
    const { api } = bridge();
    const subject = await statistics(api);
    const base = {
      objectiveId: randomUUID(),
      subjectId: subject.id,
      topicId: null,
      text: 'Calcular',
      conditions: null,
      kind: 'apply' as const,
      cardIds: [],
    };
    await expect(api['objectives.create']({ ...base, text: '   ' })).rejects.toThrow(
      'Petición rechazada en el canal «objectives.create»',
    );
    await expect(api['objectives.create']({ ...base, text: 'x'.repeat(201) })).rejects.toThrow(
      'Petición rechazada',
    );
    await expect(
      api['objectives.create']({ ...base, kind: 'dominate' as unknown as 'apply' }),
    ).rejects.toThrow('Petición rechazada');
    await expect(api['objectives.panel']({ objectiveId: 'topic:otro' })).rejects.toThrow(
      'Petición rechazada en el canal «objectives.panel»',
    );
  });

  it('[CA-151] [CA-152] los requisitos: agregar, confirmar y descartar; la propuesta de Estudiar los nombra', async () => {
    const { api } = bridge();
    const subject = await statistics(api);
    const interpret = randomUUID();
    await api['objectives.create']({
      objectiveId: interpret,
      subjectId: subject.id,
      topicId: null,
      text: 'Interpretar un intervalo de confianza',
      conditions: null,
      kind: 'understand',
      cardIds: [],
    });
    const list = await api['objectives.list']({ subjectId: subject.id });
    const calculate =
      list.topics
        .flatMap((t) => t.objectives)
        .find((o) => o.title === 'Calcular la media y el desvío')?.id ?? '';
    const requirementId = randomUUID();
    await api['objectives.requirements.add']({
      requirementId,
      objectiveId: interpret,
      requiresId: calculate,
      kind: 'indispensable',
      status: 'suggested',
    });
    expect((await api['study.overview']({})).proposal?.requirement?.kind).toBe('maybe');
    await api['objectives.requirements.confirm']({ requirementId });
    expect((await api['study.overview']({})).proposal?.requirement).toMatchObject({
      kind: 'before',
      requiresTitle: 'Calcular la media y el desvío',
    });
    await api['objectives.requirements.dismiss']({ requirementId });
    expect((await api['study.overview']({})).proposal?.requirement).toBeNull();
    await expect(
      api['objectives.requirements.add']({
        requirementId: randomUUID(),
        objectiveId: interpret,
        requiresId: calculate,
        kind: 'obligatory' as unknown as 'indispensable',
        status: 'confirmed',
      }),
    ).rejects.toThrow('Petición rechazada');
  });

  it('[CA-150] «Ya lo sé», «No quiero esto ahora» y «Retomar»', async () => {
    const { api } = bridge();
    const subject = await statistics(api);
    const objectiveId = randomUUID();
    await api['objectives.create']({
      objectiveId,
      subjectId: subject.id,
      topicId: null,
      text: 'Reconocer un estimador',
      conditions: null,
      kind: 'remember',
      cardIds: [],
    });
    await api['objectives.knowAlready']({ objectiveId });
    await api['objectives.postpone']({ objectiveId });
    expect((await api['objectives.panel']({ objectiveId })).objective).toMatchObject({
      state: 'enough',
      toVerify: true,
      postponed: true,
    });
    await api['objectives.resume']({ objectiveId });
    expect((await api['objectives.panel']({ objectiveId })).objective.postponed).toBe(false);
  });
});

describe('contrato del puente: «Mis errores» y «Mejorar la tarjeta»', () => {
  it('[CA-155] «Mis errores» y el tipo de error; un tipo que no existe se rechaza', async () => {
    const { api } = bridge();
    const subject = await statistics(api);
    const { cards } = await api['cards.list']({ subjectId: subject.id });
    const capital = cards.find((c) => c.question === 'Capital de Francia')?.id ?? '';
    const openingId = randomUUID();
    await api['activities.start']({ cardId: capital, openingId });
    const sent = await api['activities.submit']({
      cardId: capital,
      openingId,
      attemptId: randomUUID(),
      attemptNo: 1,
      answer: { type: 'short', text: 'asdf' },
      help: [],
      noIdea: false,
    });
    expect(sent.diagnosis).toEqual({ action: 'forgotten', reason: 'forgotten' });
    await api['activities.finalize']({ attemptId: sent.attemptId, verdict: 'incorrect' });
    const errors = await api['progress.errors']({});
    // El primero es el de la demostración (Fase 18); el otro, el de recién.
    expect(errors.groups.flatMap((g) => g.items)).toEqual([
      expect.objectContaining({ written: 'La media', correct: 'La mediana', type: 'confusion' }),
      expect.objectContaining({ written: 'asdf', correct: 'París', type: 'forgotten' }),
    ]);
    await api['progress.errors.setType']({
      changeId: randomUUID(),
      attemptId: sent.attemptId,
      type: 'confusion',
    });
    await expect(
      api['progress.errors.setType']({
        changeId: randomUUID(),
        attemptId: sent.attemptId,
        type: 'lazy' as unknown as 'confusion',
      }),
    ).rejects.toThrow('Petición rechazada en el canal «progress.errors.setType»');
  });

  it('[CA-154] «Mejorar la tarjeta» lista la del elenco y «Dividir en dos» pide exactamente dos partes', async () => {
    const { api } = bridge();
    const { cards } = await api['progress.improveCard.list']({});
    expect(cards.map((c) => c.question)).toEqual([
      '¿Qué significa el 95 % en un intervalo de confianza del 95 %?',
    ]);
    await expect(
      api['progress.improveCard.split']({
        splitId: randomUUID(),
        cardId: cards[0]?.cardId ?? '',
        parts: [{ question: '¿Uno?', answer: 'Uno' }],
      }),
    ).rejects.toThrow('Petición rechazada en el canal «progress.improveCard.split»');
    const done = await api['progress.improveCard.split']({
      splitId: randomUUID(),
      cardId: cards[0]?.cardId ?? '',
      parts: [
        { question: '¿Qué describe el 95 %?', answer: 'El procedimiento' },
        { question: '¿Qué no es el 95 %?', answer: 'La probabilidad de este intervalo' },
      ],
    });
    expect(done.cardIds).toHaveLength(2);
    expect((await api['progress.improveCard.list']({})).cards).toEqual([]);
  });

  it('[CA-154] «Reformular» manda la edición con la marca de mejora; una marca que no existe se rechaza', async () => {
    const { api } = bridge();
    const { cards } = await api['progress.improveCard.list']({});
    const card = cards[0];
    await expect(
      api['cards.edit']({
        cardId: card?.cardId ?? '',
        question: card?.question ?? '',
        answer: card?.answer ?? '',
        sheet: { hints: ['Pensá en muchas muestras.'] },
        improve: 'hint',
      }),
    ).resolves.toMatchObject({ sheet: { hints: ['Pensá en muchas muestras.'] } });
    expect((await api['progress.improveCard.list']({})).cards).toEqual([]);
    await expect(
      api['cards.edit']({
        cardId: card?.cardId ?? '',
        question: card?.question ?? '',
        answer: card?.answer ?? '',
        improve: 'polish' as unknown as 'hint',
      }),
    ).rejects.toThrow('Petición rechazada en el canal «cards.edit»');
  });
});
