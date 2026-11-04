import { describe, expect, it } from 'vitest';
import {
  findHoles,
  HOLE_PLACEHOLDER,
  initialSheetState,
  MAX_ESSENTIALS,
  MAX_HINTS,
  matchesFilter,
  needsMeaningQuestion,
  normalizeSheet,
  type RowContent,
  reconcileRowCards,
  rowCardKind,
  rowCardSpecs,
  splitArrow,
} from '../../src/core/cards';

// Las reglas puras de las tarjetas que nacen en un renglón (H-12), de la ficha (H-13) y de la
// lista (H-14): sin pantalla ni base de datos.

const text = (value: string) => ({ type: 'text' as const, text: value });
const hole = (id: string, value: string) => ({ type: 'cloze' as const, id, text: value });
const image = (sha = 'a'.repeat(64)) => ({
  type: 'image' as const,
  sha,
  width: 10,
  height: 10,
  alt: 'campana',
});

const plain = (content: RowContent) =>
  content
    .map((node) =>
      node.type === 'image' ? '<imagen>' : node.type === 'mention' ? node.label : node.text,
    )
    .join('');

describe('«>>» dentro de un renglón: pregunta y respuesta', () => {
  it('[CA-048] «Pendiente >> Cuánto cambia y por cada unidad de x» se parte en pregunta y respuesta', () => {
    expect(splitArrow('Pendiente >> Cuánto cambia y por cada unidad de x')).toEqual({
      question: 'Pendiente',
      answer: 'Cuánto cambia y por cada unidad de x',
    });
  });

  it('[CA-048] sin espacios alrededor de la flecha también es una tarjeta', () => {
    expect(splitArrow('Media>>Suma sobre cantidad')).toEqual({
      question: 'Media',
      answer: 'Suma sobre cantidad',
    });
  });

  it('un renglón sin flecha no es una tarjeta', () => {
    expect(splitArrow('Solo un apunte, sin flecha')).toBeNull();
    expect(splitArrow('una > sola punta')).toBeNull();
  });

  it('con dos flechas parte en la primera: la segunda queda dentro de la respuesta', () => {
    expect(splitArrow('a >> b >> c')).toEqual({ question: 'a', answer: 'b >> c' });
  });

  it('una flecha al inicio, al final o con un lado en blanco no es una tarjeta', () => {
    expect(splitArrow('>> respuesta sin pregunta')).toBeNull();
    expect(splitArrow('pregunta sin respuesta >>')).toBeNull();
    expect(splitArrow('   >>   ')).toBeNull();
    expect(splitArrow('>>')).toBeNull();
  });

  it('un renglón de sola flecha con salto o tabulación no explota', () => {
    expect(splitArrow('\t>>\t')).toBeNull();
  });
});

describe('«{{…}}»: huecos', () => {
  it('[CA-049] reconoce un hueco con su texto y su lugar', () => {
    const found = findHoles('El agua hierve a {{100 °C}} al nivel del mar');
    expect(found).toEqual([{ start: 17, end: 27, inner: '100 °C' }]);
  });

  it('un hueco al inicio del renglón se reconoce', () => {
    expect(findHoles('{{Gauss}} describió la campana')).toEqual([
      { start: 0, end: 9, inner: 'Gauss' },
    ]);
  });

  it('[CA-050] dos huecos en el mismo renglón son dos huecos, en el orden en que aparecen', () => {
    expect(findHoles('La media es {{4}} y la mediana es {{4}}').map((h) => h.inner)).toEqual([
      '4',
      '4',
    ]);
  });

  it('un hueco vacío o de solo espacios no cuenta', () => {
    expect(findHoles('antes {{}} después')).toEqual([]);
    expect(findHoles('antes {{   }} después')).toEqual([]);
  });

  it('llaves sin cerrar o sueltas no son un hueco', () => {
    expect(findHoles('{{sin cerrar')).toEqual([]);
    expect(findHoles('cierra solo }}')).toEqual([]);
    expect(findHoles('{ una sola } llave')).toEqual([]);
  });

  it('con llaves anidadas queda el hueco de adentro', () => {
    expect(findHoles('{{a {{b}} c}}').map((h) => h.inner)).toEqual(['b']);
  });

  it('un hueco con las llaves pegadas a otro es un hueco aparte', () => {
    expect(findHoles('{{uno}}{{dos}}').map((h) => h.inner)).toEqual(['uno', 'dos']);
  });
});

describe('qué tarjetas salen de un renglón', () => {
  it('[CA-048] un renglón con «>>» da una tarjeta de pregunta y respuesta', () => {
    const specs = rowCardSpecs([text('Pendiente >> Cuánto cambia y por cada unidad de x')]);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ kind: 'qa', key: 'qa', clozeId: null });
    expect(plain(specs[0]?.question ?? [])).toBe('Pendiente');
    expect(plain(specs[0]?.answer ?? [])).toBe('Cuánto cambia y por cada unidad de x');
  });

  it('[CA-049] un hueco da una tarjeta que pregunta «El agua hierve a [...] al nivel del mar»', () => {
    const specs = rowCardSpecs([
      text('El agua hierve a '),
      hole('h1', '100 °C'),
      text(' al nivel del mar'),
    ]);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ kind: 'cloze', key: 'h1', clozeId: 'h1' });
    expect(plain(specs[0]?.question ?? [])).toBe(
      `El agua hierve a ${HOLE_PLACEHOLDER} al nivel del mar`,
    );
    expect(plain(specs[0]?.answer ?? [])).toBe('100 °C');
    expect(HOLE_PLACEHOLDER).toBe('[...]');
  });

  it('[CA-050] un renglón con dos huecos da dos tarjetas, cada una con un solo hueco oculto', () => {
    const specs = rowCardSpecs([
      text('La media de 2, 4 y 6 es '),
      hole('a', '4'),
      text(' y la mediana es '),
      hole('b', '4'),
    ]);
    expect(specs.map((s) => s.key)).toEqual(['a', 'b']);
    expect(plain(specs[0]?.question ?? [])).toBe('La media de 2, 4 y 6 es [...] y la mediana es 4');
    expect(plain(specs[1]?.question ?? [])).toBe('La media de 2, 4 y 6 es 4 y la mediana es [...]');
    expect(specs.map((s) => plain(s.answer))).toEqual(['4', '4']);
  });

  it('un hueco vacío no da tarjeta', () => {
    expect(rowCardSpecs([text('antes '), hole('v', '  '), text(' después')])).toEqual([]);
  });

  it('si el renglón tiene huecos y también «>>», mandan los huecos', () => {
    const specs = rowCardSpecs([text('a >> '), hole('h', 'b')]);
    expect(specs.map((s) => s.kind)).toEqual(['cloze']);
  });

  it('un renglón común, vacío o solo de espacios no da tarjetas', () => {
    expect(rowCardSpecs([])).toEqual([]);
    expect(rowCardSpecs([text('   ')])).toEqual([]);
    expect(rowCardSpecs([text('Un apunte cualquiera')])).toEqual([]);
  });

  it('[CA-377] la imagen se queda del lado del renglón en que estaba: pregunta o respuesta', () => {
    const left = rowCardSpecs([image(), text(' Curva >> normal')]);
    expect(left[0]?.question.map((n) => n.type)).toEqual(['image', 'text']);
    expect(left[0]?.answer.map((n) => n.type)).toEqual(['text']);
    const right = rowCardSpecs([text('Curva >> '), image()]);
    expect(right[0]?.question.map((n) => n.type)).toEqual(['text']);
    expect(right[0]?.answer.map((n) => n.type)).toEqual(['image']);
  });

  it('[CA-377] en un hueco, la imagen se queda en la pregunta', () => {
    const specs = rowCardSpecs([image(), text(' vale '), hole('h', '3')]);
    expect(specs[0]?.question.map((n) => n.type)).toEqual(['image', 'text']);
  });

  it('[CA-378] la fórmula sigue siendo texto en la pregunta y en la respuesta', () => {
    const specs = rowCardSpecs([text('$\\bar{x}$ >> la media $\\frac{\\sum x}{n}$')]);
    expect(plain(specs[0]?.question ?? [])).toBe('$\\bar{x}$');
    expect(plain(specs[0]?.answer ?? [])).toBe('la media $\\frac{\\sum x}{n}$');
  });

  it('un renglón que es tarjeta se marca como «qa» o «cloze»; el que no, no se marca', () => {
    expect(rowCardKind([text('a >> b')])).toBe('qa');
    expect(rowCardKind([text('a '), hole('h', 'b')])).toBe('cloze');
    expect(rowCardKind([text('a')])).toBeNull();
  });
});

describe('la tarjeta se liga al renglón por identificador, nunca por el texto', () => {
  const spec = (key: string, question: string, answer: string) => ({
    key,
    kind: key === 'qa' ? ('qa' as const) : ('cloze' as const),
    clozeId: key === 'qa' ? null : key,
    question: [text(question)],
    answer: [text(answer)],
  });
  const existing = (
    cardId: string,
    clozeId: string | null,
    question: string,
    answer: string,
    extra: Partial<{ trashed: boolean; detached: boolean; hasHistory: boolean }> = {},
  ) => ({
    cardId,
    clozeId,
    question: [text(question)],
    answer: [text(answer)],
    trashed: false,
    detached: false,
    hasHistory: false,
    ...extra,
  });

  it('[CA-048] sin tarjeta previa, la del renglón se crea', () => {
    const plan = reconcileRowCards([], [spec('qa', 'Pendiente', 'Cuánto cambia')]);
    expect(plan.create.map((s) => s.key)).toEqual(['qa']);
    expect(plan.update).toEqual([]);
    expect(plan.lost).toEqual([]);
  });

  it('editar el texto del renglón edita la tarjeta existente y no crea otra', () => {
    const plan = reconcileRowCards(
      [existing('c1', null, 'Pendiente', 'vieja')],
      [spec('qa', 'Pendiente', 'nueva')],
    );
    expect(plan.create).toEqual([]);
    expect(plan.update.map((u) => u.cardId)).toEqual(['c1']);
  });

  it('si el texto no cambió, no hay nada que hacer', () => {
    const plan = reconcileRowCards(
      [existing('c1', null, 'Pendiente', 'igual')],
      [spec('qa', 'Pendiente', 'igual')],
    );
    expect(plan).toEqual({ create: [], update: [], reattach: [], lost: [] });
  });

  it('cambiar por completo el texto de la pregunta sigue siendo la misma tarjeta', () => {
    const plan = reconcileRowCards(
      [existing('c1', null, 'Pendiente', 'respuesta')],
      [spec('qa', 'Algo totalmente distinto', 'respuesta')],
    );
    expect(plan.create).toEqual([]);
    expect(plan.update.map((u) => u.cardId)).toEqual(['c1']);
  });

  it('[CA-050] cada hueco conserva su tarjeta aunque agreguen otro hueco antes', () => {
    const plan = reconcileRowCards(
      [existing('c-a', 'a', 'P a', '4'), existing('c-b', 'b', 'P b', '4')],
      [spec('n', 'P n', '1'), spec('a', 'P a', '4'), spec('b', 'P b', '4')],
    );
    expect(plan.create.map((s) => s.key)).toEqual(['n']);
    expect(plan.update).toEqual([]);
    expect(plan.lost).toEqual([]);
  });

  it('[CA-052] si el renglón ya no pide una tarjeta, queda perdida (con su historial anotado)', () => {
    const plan = reconcileRowCards(
      [existing('c1', null, 'P', 'R', { hasHistory: true }), existing('c2', 'h', 'P', 'R')],
      [],
    );
    expect(plan.lost).toEqual([
      { cardId: 'c1', hasHistory: true },
      { cardId: 'c2', hasHistory: false },
    ]);
  });

  it('una tarjeta que el renglón ya había soltado y vuelve a pedir se vuelve a ligar', () => {
    const plan = reconcileRowCards(
      [existing('c1', null, 'P', 'R', { detached: true, hasHistory: true })],
      [spec('qa', 'P', 'R')],
    );
    expect(plan.reattach.map((r) => r.cardId)).toEqual(['c1']);
    expect(plan.create).toEqual([]);
  });

  it('una tarjeta ya soltada no se vuelve a declarar perdida', () => {
    const plan = reconcileRowCards([existing('c1', null, 'P', 'R', { detached: true })], []);
    expect(plan.lost).toEqual([]);
  });

  it('una tarjeta que eliminaste a mano no vuelve a crearse ni se modifica mientras el renglón siga igual', () => {
    const plan = reconcileRowCards(
      [existing('c1', null, 'P', 'R', { trashed: true })],
      [spec('qa', 'P', 'otra respuesta')],
    );
    expect(plan).toEqual({ create: [], update: [], reattach: [], lost: [] });
  });
});

describe('la ficha de la tarjeta', () => {
  it('[CA-053] una tarjeta creada a mano nace «Revisada» y «Propuesta» es solo de la IA', () => {
    expect(initialSheetState('manual')).toBe('reviewed');
    expect(initialSheetState('note')).toBe('reviewed');
    expect(initialSheetState('ai')).toBe('proposed');
  });

  it('[CA-053] acepta hasta 4 componentes esenciales y hasta 3 pistas', () => {
    expect(MAX_ESSENTIALS).toBe(4);
    expect(MAX_HINTS).toBe(3);
    const ok = normalizeSheet({
      variants: ['inclinación de la recta'],
      essentials: ['a', 'b', 'c', 'd'],
      hints: ['Empieza con P', 'Es una razón', 'Va con la recta'],
    });
    expect(ok.essentials).toHaveLength(4);
    expect(ok.hints).toHaveLength(3);
  });

  it('[CA-053] con una pista de más o un quinto componente rechaza la ficha', () => {
    expect(() => normalizeSheet({ hints: ['1', '2', '3', '4'] })).toThrow();
    expect(() => normalizeSheet({ essentials: ['1', '2', '3', '4', '5'] })).toThrow();
  });

  it('[CA-053] saca los espacios de los bordes y descarta lo vacío, y conserva el orden de las pistas', () => {
    const sheet = normalizeSheet({
      variants: ['  pendiente  ', '', '   '],
      hints: ['  segunda  ', '', 'tercera'],
    });
    expect(sheet.variants).toEqual(['pendiente']);
    expect(sheet.hints).toEqual(['segunda', 'tercera']);
  });

  it('[CA-054] con historial, cambiar la pregunta o la respuesta pide «¿Cambió lo que hay que recordar?»', () => {
    const before = { question: 'P', answer: 'R' };
    expect(needsMeaningQuestion(before, { question: 'P', answer: 'R.' }, true)).toBe(true);
    expect(needsMeaningQuestion(before, { question: 'P2', answer: 'R' }, true)).toBe(true);
  });

  it('[CA-054] sin historial, o sin cambio de pregunta ni respuesta, no pregunta', () => {
    const before = { question: 'P', answer: 'R' };
    expect(needsMeaningQuestion(before, { question: 'P', answer: 'R2' }, false)).toBe(false);
    expect(needsMeaningQuestion(before, { question: 'P', answer: 'R' }, true)).toBe(false);
  });
});

describe('la lista de tarjetas', () => {
  const cards = [
    { topicId: 't1', sheetState: 'reviewed' as const, kind: 'qa' as const },
    { topicId: 't2', sheetState: 'verified' as const, kind: 'cloze' as const },
    { topicId: null, sheetState: 'reviewed' as const, kind: 'cloze' as const },
  ];

  it('[CA-056] sin filtros muestra todas', () => {
    expect(cards.filter((c) => matchesFilter(c, {}))).toHaveLength(3);
  });

  it('[CA-056] filtra por tema, por estado y por tipo, y los filtros se suman', () => {
    expect(cards.filter((c) => matchesFilter(c, { topicId: 't1' }))).toHaveLength(1);
    expect(cards.filter((c) => matchesFilter(c, { topicId: 'none' }))).toHaveLength(1);
    expect(cards.filter((c) => matchesFilter(c, { sheetState: 'reviewed' }))).toHaveLength(2);
    expect(cards.filter((c) => matchesFilter(c, { kind: 'cloze' }))).toHaveLength(2);
    expect(
      cards.filter((c) => matchesFilter(c, { sheetState: 'reviewed', kind: 'cloze' })),
    ).toHaveLength(1);
  });
});
