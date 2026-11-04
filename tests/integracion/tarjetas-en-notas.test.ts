import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '../../src/data/ids';
import { readRows, runRaw } from '../apoyo/base-cruda';
import { closeSpaces, openSpace, pngBytes } from '../apoyo/espacio';

// Las tarjetas que nacen en un renglón (H-12), su ficha y sus versiones (H-13) y la lista (H-14),
// con la base real: la identidad de una tarjeta es el renglón (y el hueco), nunca su texto.

afterEach(closeSpaces);

const text = (value: string) => ({ type: 'text' as const, text: value });
const hole = (id: string, value: string) => ({ type: 'cloze' as const, id, text: value });
const row = (id: string, content: ReturnType<typeof text | typeof hole>[], parentId = null) => ({
  id,
  parentId,
  collapsed: false,
  content,
});

function setup() {
  const space = openSpace();
  const { workspace } = space;
  const subject = workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
  const topic = workspace.topics.create({ subjectId: subject.id, name: 'Regresión' });
  const note = workspace.notes.create({ subjectId: subject.id, topicId: topic.id });
  const first = note.blocks[0]?.id ?? '';
  const save = (blocks: ReturnType<typeof row>[], title = 'Regresión lineal') =>
    workspace.notes.save({ noteId: note.id, title, blocks });
  const cards = () => workspace.cards.list({ subjectId: subject.id });
  const grade = (cardId: string, value: 'again' | 'hard' | 'good' = 'good') =>
    workspace.cards.review({ cardId, grade: value, attemptId: newId() });
  return { ...space, subject, topic, note, first, save, cards, grade };
}

describe('[CA-048] «>>» crea una tarjeta de pregunta y respuesta', () => {
  it('[CA-048] «Pendiente >> Cuánto cambia y por cada unidad de x» aparece en Tarjetas con esa pregunta y respuesta', () => {
    const { first, save, cards, workspace, subject } = setup();
    save([row(first, [text('Pendiente >> Cuánto cambia y por cada unidad de x')])]);
    const list = cards();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      question: 'Pendiente',
      answer: 'Cuánto cambia y por cada unidad de x',
      kind: 'qa',
      sheetState: 'reviewed',
      paused: false,
      nextReviewDay: null,
    });
    expect(workspace.cards.list({ subjectId: newId() })).toEqual([]);
    expect(workspace.cards.count()).toBe(1);
    expect(subject.name).toBe('Estadística básica');
  });

  it('[CA-048] un renglón sin flecha no crea tarjetas', () => {
    const { first, save, cards } = setup();
    save([row(first, [text('Un apunte común')])]);
    expect(cards()).toEqual([]);
  });

  it('guardar lo mismo dos veces no crea otra tarjeta ni otra versión', () => {
    const { first, save, cards, file } = setup();
    save([row(first, [text('P >> R')])]);
    save([row(first, [text('P >> R')])]);
    expect(cards()).toHaveLength(1);
    expect(readRows(file, 'SELECT id FROM card_versions')).toHaveLength(1);
  });
});

describe('[CA-049] un hueco crea una tarjeta de completar', () => {
  it('[CA-049] «El agua hierve a 100 °C al nivel del mar» con «100 °C» como hueco pregunta «El agua hierve a [...] al nivel del mar»', () => {
    const { first, save, cards } = setup();
    save([
      row(first, [text('El agua hierve a '), hole(newId(), '100 °C'), text(' al nivel del mar')]),
    ]);
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toMatchObject({
      question: 'El agua hierve a [...] al nivel del mar',
      answer: '100 °C',
      kind: 'cloze',
    });
  });
});

describe('[CA-050] dos huecos, dos tarjetas hermanas', () => {
  it('[CA-050] un renglón con dos huecos crea dos tarjetas hermanas, una por hueco', () => {
    const { first, save, cards, workspace } = setup();
    const a = newId();
    const b = newId();
    save([
      row(first, [
        text('La media de 2, 4 y 6 es '),
        hole(a, '4'),
        text(' y la mediana es '),
        hole(b, '4'),
      ]),
    ]);
    const list = cards();
    expect(list).toHaveLength(2);
    expect(list.map((card) => card.question).sort()).toEqual([
      'La media de 2, 4 y 6 es 4 y la mediana es [...]',
      'La media de 2, 4 y 6 es [...] y la mediana es 4',
    ]);
    const details = list.map((card) => workspace.cards.get({ cardId: card.id }));
    expect(details[0]?.siblingGroupId).not.toBeNull();
    expect(details[0]?.siblingGroupId).toBe(details[1]?.siblingGroupId);
  });

  it('[CA-050] agregar un hueco después no cambia las tarjetas que ya existían', () => {
    const { first, save, cards } = setup();
    const a = newId();
    save([row(first, [text('x '), hole(a, 'uno'), text(' y dos')])]);
    const before = cards()[0]?.id;
    save([row(first, [text('x '), hole(a, 'uno'), text(' y '), hole(newId(), 'dos')])]);
    expect(cards()).toHaveLength(2);
    expect(cards().map((card) => card.id)).toContain(before);
  });
});

describe('la identidad de la tarjeta no depende del texto', () => {
  it('editar el renglón edita la tarjeta (misma identidad, versión nueva) y no crea otra', () => {
    const { first, save, cards, file } = setup();
    save([row(first, [text('Pendiente >> Cuánto cambia')])]);
    const id = cards()[0]?.id;
    save([row(first, [text('Algo completamente distinto >> Y otra respuesta')])]);
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toMatchObject({
      id,
      question: 'Algo completamente distinto',
      answer: 'Y otra respuesta',
    });
    const versions = readRows(
      file,
      'SELECT question FROM card_versions WHERE card_id = ? ORDER BY id',
      id,
    );
    expect(versions.map((v) => v.question)).toEqual(['Pendiente', 'Algo completamente distinto']);
  });

  it('un hueco sigue siendo la misma tarjeta aunque cambie su texto', () => {
    const { first, save, cards } = setup();
    const h = newId();
    save([row(first, [text('El agua hierve a '), hole(h, '100')])]);
    const id = cards()[0]?.id;
    save([row(first, [text('El agua hierve a '), hole(h, '100 grados')])]);
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toMatchObject({ id, answer: '100 grados' });
  });

  it('mover el renglón de lugar o de padre no cambia la tarjeta', () => {
    const { first, save, cards } = setup();
    const other = newId();
    save([row(first, [text('P >> R')]), row(other, [text('otro')])]);
    const id = cards()[0]?.id;
    save([row(other, [text('otro')]), row(first, [text('P >> R')], other as never)]);
    expect(cards()).toHaveLength(1);
    expect(cards()[0]?.id).toBe(id);
  });

  it('la tarjeta se liga al renglón por su identificador: el detalle la ubica en su nota y su renglón', () => {
    const { first, save, cards, workspace, note } = setup();
    save([row(first, [text('P >> R')])]);
    const detail = workspace.cards.get({ cardId: cards()[0]?.id ?? '' });
    expect(detail.path).toMatchObject({ noteId: note.id, blockId: first, canOpenNote: true });
  });
});

describe('[CA-051] camino de contexto y «Ver en la nota»', () => {
  it('[CA-051] la tarjeta nacida en la nota muestra «Estadística básica › Regresión › Regresión lineal» y su renglón', () => {
    const { first, save, cards, workspace, note } = setup();
    save([row(first, [text('Pendiente >> Cuánto cambia')])]);
    const detail = workspace.cards.get({ cardId: cards()[0]?.id ?? '' });
    expect(detail.path).toEqual({
      subjectName: 'Estadística básica',
      topicName: 'Regresión',
      noteTitle: 'Regresión lineal',
      noteId: note.id,
      blockId: first,
      canOpenNote: true,
    });
  });

  it('[CA-051] si la nota cambia de tema o de título, el camino se actualiza solo', () => {
    const { first, save, cards, workspace, subject, note } = setup();
    save([row(first, [text('P >> R')])]);
    const other = workspace.topics.create({ subjectId: subject.id, name: 'Correlación' });
    workspace.notes.move({ noteId: note.id, topicId: other.id });
    save([row(first, [text('P >> R')])], 'Otro título');
    const detail = workspace.cards.get({ cardId: cards()[0]?.id ?? '' });
    expect(detail.path).toMatchObject({ topicName: 'Correlación', noteTitle: 'Otro título' });
  });

  it('una tarjeta suelta no tiene nota: no ofrece «Ver en la nota»', () => {
    const { workspace, subject } = setup();
    const card = workspace.cards.create({ question: 'P', answer: 'R', subjectId: subject.id });
    expect(workspace.cards.get({ cardId: card.id }).path).toEqual({
      subjectName: 'Estadística básica',
      topicName: null,
      noteTitle: null,
      noteId: null,
      blockId: null,
      canOpenNote: false,
    });
  });
});

describe('[CA-052] borrar un renglón que es tarjeta', () => {
  it('[CA-052] con historial: la tarjeta se conserva, avisa cuál es y no tiene más «Ver en la nota»', () => {
    const { first, save, cards, workspace, grade } = setup();
    save([row(first, [text('Pendiente >> Cuánto cambia')])]);
    const id = cards()[0]?.id ?? '';
    grade(id);
    const response = save([row(newId(), [text('otro renglón')])]);
    expect(response.lostCards).toEqual([{ cardId: id, question: 'Pendiente' }]);
    expect(cards().map((card) => card.id)).toEqual([id]);
    expect(workspace.cards.get({ cardId: id }).path.canOpenNote).toBe(false);
    expect(workspace.cards.history({ cardId: id }).entries).toHaveLength(1);
  });

  it('[CA-052] «Eliminar la tarjeta» la manda a la Papelera, con su historial', () => {
    const { first, save, cards, workspace, grade } = setup();
    save([row(first, [text('P >> R')])]);
    const id = cards()[0]?.id ?? '';
    grade(id);
    save([row(newId(), [text('otro')])]);
    workspace.cards.remove({ cardId: id });
    expect(cards()).toEqual([]);
    expect(workspace.trash.list().map((item) => item.cardId)).toEqual([id]);
  });

  it('sin historial: la tarjeta se va a la Papelera con el renglón', () => {
    const { first, save, cards, workspace } = setup();
    save([row(first, [text('P >> R')])]);
    const id = cards()[0]?.id ?? '';
    const response = save([row(newId(), [text('otro')])]);
    expect(response.lostCards).toEqual([]);
    expect(cards()).toEqual([]);
    expect(workspace.trash.list().map((item) => item.cardId)).toEqual([id]);
  });

  it('si el renglón vuelve (deshacer en el editor), la tarjeta vuelve con su historial', () => {
    const { first, save, cards, workspace, grade } = setup();
    save([row(first, [text('P >> R')])]);
    const id = cards()[0]?.id ?? '';
    grade(id);
    const sin = save([row(newId(), [text('otro')])]);
    expect(sin.lostCards).toHaveLength(1);
    save([row(first, [text('P >> R')])]);
    expect(workspace.cards.get({ cardId: id }).path.canOpenNote).toBe(true);
  });

  it('si el renglón sin historial vuelve, la tarjeta sale de la Papelera', () => {
    const { first, save, cards, workspace } = setup();
    save([row(first, [text('P >> R')])]);
    const id = cards()[0]?.id ?? '';
    save([row(newId(), [text('otro')])]);
    expect(cards()).toEqual([]);
    save([row(first, [text('P >> R')])]);
    expect(cards().map((card) => card.id)).toEqual([id]);
    expect(workspace.trash.list()).toEqual([]);
  });

  it('quitar solo la flecha de un renglón también cuenta como perder la tarjeta', () => {
    const { first, save, cards, grade } = setup();
    save([row(first, [text('P >> R')])]);
    const id = cards()[0]?.id ?? '';
    grade(id);
    const response = save([row(first, [text('P R')])]);
    expect(response.lostCards).toEqual([{ cardId: id, question: 'P' }]);
  });
});

describe('[CA-054] versiones y «¿Cambió lo que hay que recordar?»', () => {
  function withHistory() {
    const ctx = setup();
    const card = ctx.workspace.cards.create({
      question: '¿Qué es la media muestral?',
      answer: 'La suma de los datos dividida por la cantidad',
      subjectId: ctx.subject.id,
    });
    ctx.grade(card.id);
    const scheduleOf = () =>
      readRows(
        ctx.file,
        'SELECT state, stability, difficulty, due_at, reps FROM card_schedule WHERE card_id = ?',
        card.id,
      )[0];
    return { ...ctx, card, scheduleOf };
  }

  it('[CA-054] cada cambio de pregunta o respuesta crea una versión inmutable y la anterior queda igual', () => {
    const { workspace, card, file } = withHistory();
    workspace.cards.edit({
      cardId: card.id,
      question: card.question,
      answer: 'Otra',
      meaningChanged: false,
    });
    const versions = readRows(
      file,
      'SELECT answer FROM card_versions WHERE card_id = ? ORDER BY id',
      card.id,
    );
    expect(versions.map((v) => v.answer)).toEqual([
      'La suma de los datos dividida por la cantidad',
      'Otra',
    ]);
    expect(() =>
      runRaw(file, 'UPDATE card_versions SET answer = ? WHERE card_id = ?', 'x', card.id),
    ).toThrow();
  });

  it('[CA-054] con historial, guardar un cambio sin contestar la pregunta no guarda nada', () => {
    const { workspace, card, file } = withHistory();
    expect(() =>
      workspace.cards.edit({ cardId: card.id, question: card.question, answer: 'Otra' }),
    ).toThrow(/hay que recordar/i);
    expect(readRows(file, 'SELECT id FROM card_versions WHERE card_id = ?', card.id)).toHaveLength(
      1,
    );
  });

  it('[CA-054] «No, solo la redacción» conserva el próximo repaso', () => {
    const { workspace, card, scheduleOf } = withHistory();
    const before = scheduleOf();
    const dayBefore = workspace.cards.get({ cardId: card.id }).nextReviewDay;
    const edited = workspace.cards.edit({
      cardId: card.id,
      question: card.question,
      answer: 'La suma de los datos dividida por la cantidad.',
      meaningChanged: false,
    });
    expect(scheduleOf()).toEqual(before);
    expect(edited.nextReviewDay).not.toBeNull();
    expect(edited.nextReviewDay).toBe(dayBefore);
  });

  it('[CA-054] «Sí» la programa como nueva y el historial anterior sigue a la vista', () => {
    const { workspace, card } = withHistory();
    const edited = workspace.cards.edit({
      cardId: card.id,
      question: card.question,
      answer: 'Una respuesta de fondo distinta',
      meaningChanged: true,
    });
    expect(edited.nextReviewDay).toBeNull();
    const history = workspace.cards.history({ cardId: card.id });
    expect(history.entries.map((entry) => entry.result)).toEqual(['good', 'reset']);
    expect(workspace.verifyData()).toEqual([]);
  });

  it('[CA-054] después de «Sí», el próximo repaso se calcula como el de una tarjeta nueva', () => {
    const { workspace, card, grade } = withHistory();
    workspace.cards.edit({
      cardId: card.id,
      question: card.question,
      answer: 'Cambio de fondo',
      meaningChanged: true,
    });
    const again = grade(card.id);
    expect(again.nextReviewDay).not.toBeNull();
    expect(workspace.cards.history({ cardId: card.id }).entries.map((e) => e.result)).toEqual([
      'good',
      'reset',
      'good',
    ]);
    expect(workspace.verifyData()).toEqual([]);
  });

  it('[CA-054] sin historial, editar no pregunta nada', () => {
    const { workspace, subject } = setup();
    const card = workspace.cards.create({ question: 'P', answer: 'R', subjectId: subject.id });
    const edited = workspace.cards.edit({ cardId: card.id, question: 'P', answer: 'R2' });
    expect(edited.answer).toBe('R2');
  });

  it('[CA-054] cada repaso guarda la versión que evaluó', () => {
    const { workspace, card, file, grade } = withHistory();
    workspace.cards.edit({
      cardId: card.id,
      question: card.question,
      answer: 'Segunda',
      meaningChanged: false,
    });
    grade(card.id, 'hard');
    const versions = readRows(
      file,
      'SELECT id FROM card_versions WHERE card_id = ? ORDER BY id',
      card.id,
    ).map((v) => v.id);
    const reviews = readRows(
      file,
      "SELECT payload FROM observations WHERE kind = 'review.graded' ORDER BY seq",
    ).map((r) => (JSON.parse(String(r.payload)) as { versionId: string }).versionId);
    expect(reviews).toEqual([versions[0], versions[1]]);
  });

  it('[CA-054] un cambio de una tarjeta de la nota con historial avisa y, si decís «Sí», la programa como nueva', () => {
    const { first, save, cards, workspace, grade } = setup();
    save([row(first, [text('P >> R')])]);
    const id = cards()[0]?.id ?? '';
    grade(id);
    const response = save([row(first, [text('P >> R cambiada de fondo')])]);
    expect(response.editedCards).toEqual([{ cardId: id, question: 'P' }]);
    expect(cards()[0]?.nextReviewDay).not.toBeNull();
    const after = workspace.cards.markMeaningChanged({ cardId: id });
    expect(after.nextReviewDay).toBeNull();
    expect(workspace.verifyData()).toEqual([]);
  });

  it('[CA-054] una tarjeta de la nota no se edita por su ficha: el texto se edita en el renglón', () => {
    const { first, save, cards, workspace } = setup();
    save([row(first, [text('P >> R')])]);
    expect(() =>
      workspace.cards.edit({ cardId: cards()[0]?.id ?? '', question: 'P', answer: 'otra' }),
    ).toThrow(/renglón/i);
  });
});

describe('[CA-053] la ficha', () => {
  const sheet = {
    referenceAnswer: 'Cuánto cambia y por cada unidad de x',
    variants: ['inclinación de la recta'],
    essentials: ['cambio de y', 'por unidad de x'],
    hints: ['Empieza con P', 'Es una razón'],
    explanation: 'Es el coeficiente de x en la recta.',
    source: 'Apunte de regresión, página 2',
    formType: 'meaning' as const,
  };

  it('[CA-053] una tarjeta creada a mano nace «Revisada»', () => {
    const { workspace, subject } = setup();
    const card = workspace.cards.create({ question: 'P', answer: 'R', subjectId: subject.id });
    expect(workspace.cards.get({ cardId: card.id }).sheet).toMatchObject({
      state: 'reviewed',
      formType: 'exact',
      variants: [],
      hints: [],
    });
  });

  it('[CA-053] guarda respuesta de referencia, variantes, componentes, pistas ordenadas, explicación y fuente, y siguen ahí al volver a abrir', () => {
    const { workspace, subject, reopen } = setup();
    const card = workspace.cards.create({
      question: 'Pendiente',
      answer: 'R',
      subjectId: subject.id,
    });
    workspace.cards.edit({ cardId: card.id, question: 'Pendiente', answer: 'R', sheet });
    const reopened = reopen();
    expect(reopened.cards.get({ cardId: card.id }).sheet).toEqual({ ...sheet, state: 'reviewed' });
  });

  it('[CA-053] cambiar solo la ficha crea una versión nueva y no pregunta por lo que hay que recordar', () => {
    const { workspace, subject, grade, file } = setup();
    const card = workspace.cards.create({ question: 'P', answer: 'R', subjectId: subject.id });
    grade(card.id);
    workspace.cards.edit({ cardId: card.id, question: 'P', answer: 'R', sheet });
    expect(readRows(file, 'SELECT id FROM card_versions WHERE card_id = ?', card.id)).toHaveLength(
      2,
    );
  });

  it('[CA-053] «Verificada» solo la marcás vos; «Propuesta» no se puede elegir', () => {
    const { workspace, subject } = setup();
    const card = workspace.cards.create({ question: 'P', answer: 'R', subjectId: subject.id });
    for (const state of ['verified', 'in_review', 'retired', 'reviewed'] as const) {
      workspace.cards.edit({ cardId: card.id, question: 'P', answer: 'R', sheet: { state } });
      expect(workspace.cards.get({ cardId: card.id }).sheet.state).toBe(state);
    }
    expect(() =>
      workspace.cards.edit({
        cardId: card.id,
        question: 'P',
        answer: 'R',
        sheet: { state: 'proposed' as never },
      }),
    ).toThrow();
  });

  it('[CA-053] más de 3 pistas o más de 4 componentes esenciales se rechazan', () => {
    const { workspace, subject } = setup();
    const card = workspace.cards.create({ question: 'P', answer: 'R', subjectId: subject.id });
    expect(() =>
      workspace.cards.edit({
        cardId: card.id,
        question: 'P',
        answer: 'R',
        sheet: { hints: ['1', '2', '3', '4'] },
      }),
    ).toThrow();
    expect(() =>
      workspace.cards.edit({
        cardId: card.id,
        question: 'P',
        answer: 'R',
        sheet: { essentials: ['1', '2', '3', '4', '5'] },
      }),
    ).toThrow();
  });

  it('cambiar el estado no pierde lo demás de la ficha', () => {
    const { workspace, subject } = setup();
    const card = workspace.cards.create({ question: 'P', answer: 'R', subjectId: subject.id });
    workspace.cards.edit({ cardId: card.id, question: 'P', answer: 'R', sheet });
    workspace.cards.edit({
      cardId: card.id,
      question: 'P',
      answer: 'R',
      sheet: { state: 'verified' },
    });
    expect(workspace.cards.get({ cardId: card.id }).sheet).toEqual({ ...sheet, state: 'verified' });
  });
});

describe('[CA-055] crear inversa', () => {
  it('[CA-055] «Pendiente» da una hermana que pregunta «Cuánto cambia y por cada unidad de x» y responde «Pendiente»', () => {
    const { first, save, cards, workspace } = setup();
    save([row(first, [text('Pendiente >> Cuánto cambia y por cada unidad de x')])]);
    const original = cards()[0];
    const made = workspace.cards.createInverse({ cardId: original?.id ?? '' });
    expect(made.created).toBe(true);
    expect(made.card).toMatchObject({
      question: 'Cuánto cambia y por cada unidad de x',
      answer: 'Pendiente',
      kind: 'qa',
      sheetState: 'reviewed',
    });
    expect(cards()).toHaveLength(2);
    const detail = workspace.cards.get({ cardId: made.card.id });
    expect(detail.inverseOfCardId).toBe(original?.id);
    expect(detail.siblingGroupId).toBe(
      workspace.cards.get({ cardId: original?.id ?? '' }).siblingGroupId,
    );
    expect(detail.siblingGroupId).not.toBeNull();
  });

  it('[CA-055] pedir la inversa dos veces no crea una tercera tarjeta', () => {
    const { workspace, subject, cards } = setup();
    const card = workspace.cards.create({ question: 'P', answer: 'R', subjectId: subject.id });
    workspace.cards.createInverse({ cardId: card.id });
    const second = workspace.cards.createInverse({ cardId: card.id });
    expect(second.created).toBe(false);
    expect(cards()).toHaveLength(2);
  });

  it('la inversa queda en el mismo tema y materia, y es una tarjeta suelta', () => {
    const { workspace, subject, topic, cards } = setup();
    const card = workspace.cards.create({
      question: 'P',
      answer: 'R',
      subjectId: subject.id,
      topicId: topic.id,
    });
    const made = workspace.cards.createInverse({ cardId: card.id });
    expect(made.card.topicId).toBe(topic.id);
    expect(workspace.cards.get({ cardId: made.card.id }).path.canOpenNote).toBe(false);
    expect(cards()).toHaveLength(2);
  });

  it('una tarjeta de completar no tiene inversa', () => {
    const { first, save, cards, workspace } = setup();
    save([row(first, [text('a '), hole(newId(), 'b')])]);
    expect(() => workspace.cards.createInverse({ cardId: cards()[0]?.id ?? '' })).toThrow();
  });
});

describe('[CA-057] pausar una tarjeta', () => {
  it('[CA-057] pausada queda marcada, conserva su historial, y al reanudar vuelve', () => {
    const { workspace, subject, grade, cards } = setup();
    const card = workspace.cards.create({ question: 'P', answer: 'R', subjectId: subject.id });
    const reviewed = grade(card.id);
    const paused = workspace.cards.setPaused({ cardId: card.id, paused: true });
    expect(paused.paused).toBe(true);
    expect(paused.nextReviewDay).toBe(reviewed.nextReviewDay);
    expect(cards()[0]?.paused).toBe(true);
    expect(workspace.cards.history({ cardId: card.id }).entries).toHaveLength(1);
    const resumed = workspace.cards.setPaused({ cardId: card.id, paused: false });
    expect(resumed.paused).toBe(false);
    expect(resumed.nextReviewDay).toBe(reviewed.nextReviewDay);
  });

  it('pausar dos veces o reanudar una que no está pausada no cambia nada', () => {
    const { workspace, subject } = setup();
    const card = workspace.cards.create({ question: 'P', answer: 'R', subjectId: subject.id });
    expect(workspace.cards.setPaused({ cardId: card.id, paused: false }).paused).toBe(false);
    workspace.cards.setPaused({ cardId: card.id, paused: true });
    expect(workspace.cards.setPaused({ cardId: card.id, paused: true }).paused).toBe(true);
  });

  it('la pausa sobrevive a cerrar y abrir', () => {
    const { workspace, subject, reopen } = setup();
    const card = workspace.cards.create({ question: 'P', answer: 'R', subjectId: subject.id });
    workspace.cards.setPaused({ cardId: card.id, paused: true });
    expect(reopen().cards.get({ cardId: card.id }).paused).toBe(true);
  });
});

describe('[CA-056] la lista por materia', () => {
  it('[CA-056] cada materia ve solo sus tarjetas y el contador no mezcla', () => {
    const { workspace, subject } = setup();
    const history = workspace.subjects.create({ name: 'Historia argentina' });
    workspace.cards.create({ question: 'A', answer: 'a', subjectId: subject.id });
    workspace.cards.create({ question: 'B', answer: 'b', subjectId: subject.id });
    workspace.cards.create({ question: 'C', answer: 'c', subjectId: history.id });
    expect(workspace.cards.list({ subjectId: subject.id })).toHaveLength(2);
    expect(workspace.cards.list({ subjectId: history.id })).toHaveLength(1);
    expect(workspace.cards.list()).toHaveLength(3);
  });

  it('[CA-056] cada tarjeta trae su tema para filtrar y su próximo repaso', () => {
    const { workspace, subject, topic, grade } = setup();
    const card = workspace.cards.create({
      question: 'P',
      answer: 'R',
      subjectId: subject.id,
      topicId: topic.id,
    });
    grade(card.id);
    const listed = workspace.cards.list({ subjectId: subject.id })[0];
    expect(listed).toMatchObject({ topicId: topic.id, topicName: 'Regresión' });
    expect(listed?.nextReviewDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('la tarjeta nacida en una nota hereda el tema de la nota', () => {
    const { first, save, cards, topic } = setup();
    save([row(first, [text('P >> R')])]);
    expect(cards()[0]?.topicId).toBe(topic.id);
  });

  it('las tarjetas sin materia de una base vieja pasan a la primera materia que se crea', () => {
    const space = openSpace();
    space.workspace.cards.create({ question: 'Vieja', answer: 'x' });
    const subject = space.workspace.subjects.create({ name: 'Primera', makeActive: true });
    expect(space.workspace.cards.list({ subjectId: subject.id }).map((c) => c.question)).toEqual([
      'Vieja',
    ]);
  });
});

describe('todo lo anterior deja los datos sanos', () => {
  it('«Verificar datos» no encuentra diferencias después de crear, editar, repasar, reiniciar y borrar', () => {
    const { first, save, cards, workspace, grade } = setup();
    save([row(first, [text('P >> R')])]);
    const id = cards()[0]?.id ?? '';
    grade(id);
    workspace.cards.markMeaningChanged({ cardId: id });
    grade(id, 'again');
    save([row(newId(), [text('otro')])]);
    workspace.cards.remove({ cardId: id });
    expect(workspace.verifyData()).toEqual([]);
  });
});

describe('lo que marcó la revisión independiente', () => {
  const image = (sha: string) => ({
    type: 'image' as const,
    sha,
    width: 1,
    height: 1,
    alt: '',
  });

  it('una tarjeta nacida en una nota cuya nota se fue a la Papelera se edita como una suelta (y su pantalla no dice que está ligada)', () => {
    const { first, save, cards, workspace, note, grade } = setup();
    save([row(first, [text('P >> R')])]);
    const id = cards()[0]?.id ?? '';
    grade(id);
    expect(workspace.cards.get({ cardId: id }).linked).toBe(true);
    workspace.notes.remove({ noteId: note.id });
    const detail = workspace.cards.get({ cardId: id });
    expect(detail.linked).toBe(false);
    const edited = workspace.cards.edit({
      cardId: id,
      question: 'P nueva',
      answer: 'R nueva',
      meaningChanged: false,
    });
    expect(edited).toMatchObject({ question: 'P nueva', answer: 'R nueva' });
  });

  it('con la nota eliminada para siempre la tarjeta también se puede editar', () => {
    const { first, save, cards, workspace, note } = setup();
    save([row(first, [text('P >> R')])]);
    const id = cards()[0]?.id ?? '';
    workspace.notes.remove({ noteId: note.id });
    workspace.trash.empty();
    expect(workspace.cards.edit({ cardId: id, question: 'P2', answer: 'R' }).question).toBe('P2');
  });

  it('un renglón que es solo una imagen en un lado da una tarjeta con texto (nunca vacío), y su ficha se puede guardar', () => {
    const { first, save, cards, workspace } = setup();
    const { sha } = workspace.images.save({
      bytes: pngBytes(),
      mime: 'image/png',
      width: 1,
      height: 1,
    });
    save([row(first, [text('Curva >> '), image(sha) as never])]);
    const card = cards()[0];
    expect(card?.question).toBe('Curva');
    expect(card?.answer).not.toBe('');
    const saved = workspace.cards.edit({
      cardId: card?.id ?? '',
      question: card?.question ?? '',
      answer: card?.answer ?? '',
      sheet: { explanation: 'x' },
    });
    expect(saved.sheet.explanation).toBe('x');
  });

  it('un renglón con dos huecos con el mismo identificador crea una sola tarjeta y no la deja desactualizada', () => {
    const { first, save, cards } = setup();
    const same = newId();
    save([row(first, [text('a '), hole(same, 'uno'), text(' b '), hole(same, 'dos')])]);
    expect(cards()).toHaveLength(1);
    save([row(first, [text('a '), hole(same, 'uno!'), text(' b '), hole(same, 'dos')])]);
    expect(cards()).toHaveLength(1);
    expect(cards()[0]?.answer).toBe('uno!');
  });

  it('una tarjeta pausada no se puede repasar hasta que la reanudes', () => {
    const { workspace, subject, grade } = setup();
    const card = workspace.cards.create({ question: 'P', answer: 'R', subjectId: subject.id });
    workspace.cards.setPaused({ cardId: card.id, paused: true });
    expect(() => grade(card.id)).toThrow(/pausa/i);
    workspace.cards.setPaused({ cardId: card.id, paused: false });
    expect(grade(card.id).nextReviewDay).not.toBeNull();
  });

  it('la inversa de una inversa no se crea (sería un duplicado de la original)', () => {
    const { workspace, subject } = setup();
    const card = workspace.cards.create({ question: 'P', answer: 'R', subjectId: subject.id });
    const inverse = workspace.cards.createInverse({ cardId: card.id }).card;
    expect(() => workspace.cards.createInverse({ cardId: inverse.id })).toThrow();
  });
});
