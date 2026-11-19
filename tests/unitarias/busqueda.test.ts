import { describe, expect, it } from 'vitest';
import {
  compareHits,
  foldText,
  formulaText,
  fragmentOf,
  matchPlan,
  parseSearchQuery,
  quoteForIndex,
  type RankedHit,
  relevanceOf,
  segmentsOf,
  titleMatch,
} from '../../src/core/search';

// Las reglas de la búsqueda que no necesitan base: cómo se lee lo que escribís, cómo se arman
// las consultas al índice, cómo se ordenan los resultados y cómo se resalta la coincidencia.

describe('leer lo que se escribe', () => {
  it('[CA-098] «tipo:tarjeta mediana» pide solo tarjetas y la palabra «mediana»', () => {
    expect(parseSearchQuery('tipo:tarjeta mediana')).toEqual({
      terms: ['mediana'],
      types: ['card'],
      subject: null,
      topic: null,
    });
  });

  it('[CA-098] «materia:historia mayo» pide la materia «historia» y la palabra «mayo»', () => {
    expect(parseSearchQuery('materia:historia mayo')).toEqual({
      terms: ['mayo'],
      types: null,
      subject: 'historia',
      topic: null,
    });
  });

  it('el tema se escribe con «tema:» y, si tiene espacios, entre comillas', () => {
    expect(parseSearchQuery('tema:"intervalos de confianza" error')).toEqual({
      terms: ['error'],
      types: null,
      subject: null,
      topic: 'intervalos de confianza',
    });
    expect(parseSearchQuery('tema:media sqrt').topic).toBe('media');
  });

  it('los filtros no distinguen mayúsculas ni tildes ni el plural', () => {
    expect(parseSearchQuery('TIPO:Tarjetas varianza').types).toEqual(['card']);
    expect(parseSearchQuery('Materia:Estadística').subject).toBe('Estadística');
  });

  it('«tipo:apunte» abarca notas y renglones; «tipo:duda», «tipo:tema» y «tipo:material» cada uno lo suyo', () => {
    expect(parseSearchQuery('tipo:apunte').types).toEqual(['note', 'block']);
    expect(parseSearchQuery('tipo:duda').types).toEqual(['doubt']);
    expect(parseSearchQuery('tipo:tema').types).toEqual(['topic']);
    expect(parseSearchQuery('tipo:material').types).toEqual(['material', 'section']);
  });

  it('un tipo que no existe no encuentra nada, en vez de buscar la palabra con los dos puntos', () => {
    expect(parseSearchQuery('tipo:marciano hola').types).toEqual([]);
  });

  it('sin filtros devuelve las palabras tal como se escribieron y nada más', () => {
    expect(parseSearchQuery('  desvio   estándar ')).toEqual({
      terms: ['desvio', 'estándar'],
      types: null,
      subject: null,
      topic: null,
    });
    expect(parseSearchQuery('')).toEqual({ terms: [], types: null, subject: null, topic: null });
  });

  it('un texto larguísimo se recorta: hasta 8 palabras de hasta 64 letras', () => {
    const parsed = parseSearchQuery(`${'a'.repeat(500)} ${'palabra '.repeat(50)}`);
    expect(parsed.terms.length).toBeLessThanOrEqual(8);
    expect(parsed.terms.every((term) => term.length <= 64)).toBe(true);
  });
});

describe('plegar el texto', () => {
  it('quita tildes y mayúsculas', () => {
    expect(foldText('¿Qué mide el DESVÍO estándar?')).toBe('¿que mide el desvio estandar?');
  });

  it('plegar no cambia el largo: cada letra queda en su lugar', () => {
    for (const text of ['Ñandú', 'ÁÉÍÓÚ üñ', 'x̄ − μ₀', 'ǅ']) {
      expect(foldText(text).length).toBe(text.length);
    }
  });
});

describe('armar la consulta al índice', () => {
  it('[CA-096] una palabra de 3 letras o más va al índice de pedazos, entre comillas', () => {
    expect(matchPlan(['varian'])).toEqual({ pieces: '"varian"', words: null, impossible: false });
  });

  it('un pedazo de menos de 3 letras busca solo por palabra entera', () => {
    expect(matchPlan(['n'])).toEqual({ pieces: null, words: '"n"', impossible: false });
    expect(matchPlan(['de', 'varianza'])).toEqual({
      pieces: '"varianza"',
      words: '"de"',
      impossible: false,
    });
  });

  it('las palabras se piden todas juntas', () => {
    expect(matchPlan(['desvio', 'estandar']).pieces).toBe('"desvio" AND "estandar"');
  });

  it('[CA-097] una fórmula con paréntesis, barras y asteriscos viaja como texto, no como sintaxis', () => {
    expect(matchPlan(['sqrt(n']).pieces).toBe('"sqrt(n"');
    expect(quoteForIndex('"*()[]')).toBe('"""*()[]"');
    expect(quoteForIndex('a"b')).toBe('"a""b"');
  });

  it('un pedazo corto sin letras ni números no se puede buscar: se ignora, y si no queda nada no hay resultados', () => {
    expect(matchPlan(['*']).impossible).toBe(true);
    expect(matchPlan(['"']).impossible).toBe(true);
    expect(matchPlan(['*', '/'])).toEqual({ pieces: null, words: null, impossible: true });
    expect(matchPlan(['s', '/', 'sqrt(n)'])).toEqual({
      pieces: '"sqrt(n)"',
      words: '"s"',
      impossible: false,
    });
  });

  it('sin palabras no hay consulta', () => {
    expect(matchPlan([])).toEqual({ pieces: null, words: null, impossible: false });
  });
});

const hit = (overrides: Partial<RankedHit> = {}): RankedHit => ({
  id: 'card:1',
  kind: 'card',
  exact: false,
  relevance: 5,
  activeSubject: false,
  archived: false,
  openedAt: null,
  touchedAt: '2027-03-01T00:00:00.000Z',
  ...overrides,
});

const order = (hits: RankedHit[]) => [...hits].sort(compareHits).map((candidate) => candidate.id);

describe('el orden de los resultados', () => {
  it('la coincidencia exacta de título o alias va primero, aunque sea menos relevante', () => {
    expect(
      order([hit({ id: 'a', relevance: 50 }), hit({ id: 'b', relevance: 1, exact: true })]),
    ).toEqual(['b', 'a']);
  });

  it('después va la relevancia: la más alta primero', () => {
    expect(order([hit({ id: 'a', relevance: 5 }), hit({ id: 'b', relevance: 9 })])).toEqual([
      'b',
      'a',
    ]);
  });

  it('a igualdad, la materia activa antes que las otras', () => {
    expect(order([hit({ id: 'a' }), hit({ id: 'b', activeSubject: true })])).toEqual(['b', 'a']);
  });

  it('a igualdad, lo abierto hace poco antes que lo viejo, y lo más reciente primero', () => {
    expect(
      order([
        hit({ id: 'nunca' }),
        hit({ id: 'ayer', openedAt: '2027-03-14T10:00:00.000Z' }),
        hit({ id: 'hoy', openedAt: '2027-03-15T10:00:00.000Z' }),
      ]),
    ).toEqual(['hoy', 'ayer', 'nunca']);
  });

  it('a igualdad, lo archivado al final', () => {
    expect(order([hit({ id: 'a', archived: true }), hit({ id: 'b' })])).toEqual(['b', 'a']);
  });

  it('la relevancia casi igual cuenta como igual: manda la materia activa', () => {
    expect(
      order([
        hit({ id: 'a', relevance: 5.04 }),
        hit({ id: 'b', relevance: 5.0, activeSubject: true }),
      ]),
    ).toEqual(['b', 'a']);
  });

  it('con todo igual, una tarjeta antes que un renglón de una nota, y después lo más nuevo', () => {
    expect(
      order([
        hit({ id: 'renglon', kind: 'block' }),
        hit({ id: 'vieja', touchedAt: '2027-01-01T00:00:00.000Z' }),
        hit({ id: 'nueva', touchedAt: '2027-03-01T00:00:00.000Z' }),
      ]),
    ).toEqual(['nueva', 'vieja', 'renglon']);
  });

  it('el orden es el mismo sin importar cómo llegaron los resultados', () => {
    const hits = [
      hit({ id: 'a', relevance: 7 }),
      hit({ id: 'b', relevance: 7, activeSubject: true }),
      hit({ id: 'c', relevance: 3, exact: true }),
      hit({ id: 'd', relevance: 7, archived: true }),
    ];
    expect(order(hits)).toEqual(order([...hits].reverse()));
    expect(order(hits)).toEqual(['c', 'b', 'a', 'd']);
  });
});

describe('qué tan bien coincide el título', () => {
  it('cuenta las palabras buscadas que están en el título y qué parte del título ocupan', () => {
    const match = titleMatch('¿Qué mide el desvío estándar?', ['desvio']);
    expect(match.matched).toBe(1);
    expect(match.coverage).toBeCloseTo(6 / 29, 5);
  });

  it('una palabra que no está en el título no cuenta', () => {
    expect(titleMatch('Media y desvío', ['desvio', 'varianza'])).toEqual({
      matched: 1,
      coverage: 6 / 14,
    });
    expect(titleMatch('Hola', ['zzzz'])).toEqual({ matched: 0, coverage: 0 });
    expect(titleMatch('', ['a'])).toEqual({ matched: 0, coverage: 0 });
  });
});

describe('la relevancia', () => {
  const match = (matched: number, coverage: number) => ({ matched, coverage });

  it('el título pesa más que el cuerpo: coincidir solo en el cuerpo vale menos que en cualquier título', () => {
    expect(relevanceOf('card', match(0, 0), 1)).toBeLessThan(
      relevanceOf('card', match(1, 0.01), 1),
    );
  });

  it('un título más corto, que la palabra ocupa más, es más relevante', () => {
    expect(relevanceOf('card', match(1, 0.2), 1)).toBeGreaterThan(
      relevanceOf('card', match(1, 0.1), 1),
    );
  });

  it('con varias palabras, importa cuántas están en el título', () => {
    expect(relevanceOf('card', match(2, 0.3), 2)).toBeGreaterThan(
      relevanceOf('card', match(1, 0.3), 2),
    );
  });

  it('una tarjeta vale algo más que un apunte, un renglón o una duda con la misma coincidencia', () => {
    const same = match(1, 0.3);
    const card = relevanceOf('card', same, 1);
    for (const kind of ['note', 'block', 'doubt'] as const) {
      expect(card).toBeGreaterThan(relevanceOf(kind, same, 1));
    }
  });

  it('sin palabras (solo filtros) no hay coincidencia que premiar: vale lo del cuerpo, con el peso de cada tipo', () => {
    expect(relevanceOf('card', match(0, 0), 0)).toBe(40);
    expect(relevanceOf('doubt', match(0, 0), 0)).toBeCloseTo(36, 5);
    expect(relevanceOf('card', match(0, 0), 0)).toBe(relevanceOf('card', match(1, 1), 0));
  });
});

describe('resaltar la coincidencia', () => {
  it('[CA-095] «desvio» resalta «desvío» con su tilde, sin distinguir mayúsculas', () => {
    expect(segmentsOf('¿Qué mide el Desvío estándar?', ['desvio'])).toEqual([
      { text: '¿Qué mide el ', match: false },
      { text: 'Desvío', match: true },
      { text: ' estándar?', match: false },
    ]);
  });

  it('resalta cada aparición de cada palabra', () => {
    const marked = segmentsOf('la media y la mediana', ['media']).filter((s) => s.match);
    expect(marked.map((s) => s.text)).toEqual(['media', 'media']);
  });

  it('un pedazo corto solo resalta la palabra entera', () => {
    const marked = segmentsOf('n es el tamaño; nunca cambia', ['n']).filter((s) => s.match);
    expect(marked.map((s) => s.text)).toEqual(['n']);
  });

  it('[CA-097] resalta una fórmula con símbolos', () => {
    const marked = segmentsOf('s / sqrt(n)', ['sqrt(n']).filter((s) => s.match);
    expect(marked.map((s) => s.text)).toEqual(['sqrt(n']);
  });

  it('el texto se devuelve entero: nada se pierde ni se inventa', () => {
    const text = 'Una muestra es una parte de la población.';
    expect(
      segmentsOf(text, ['muestra', 'parte'])
        .map((s) => s.text)
        .join(''),
    ).toBe(text);
  });

  it('sin coincidencias, un solo tramo sin resaltar', () => {
    expect(segmentsOf('hola', ['zzzz'])).toEqual([{ text: 'hola', match: false }]);
    expect(segmentsOf('', ['a'])).toEqual([]);
  });

  it('el fragmento de un texto largo se centra en la primera coincidencia y marca los cortes con «…»', () => {
    const text = `${'palabra '.repeat(40)}varianza ${'cola '.repeat(40)}`;
    const fragment = fragmentOf(text, ['varian'], 60);
    const joined = fragment.map((s) => s.text).join('');
    expect(joined.length).toBeLessThanOrEqual(64);
    expect(joined.startsWith('…')).toBe(true);
    expect(joined.endsWith('…')).toBe(true);
    expect(fragment.some((s) => s.match && s.text.startsWith('varian'))).toBe(true);
  });

  it('un texto corto no se corta', () => {
    expect(
      fragmentOf('La mediana.', ['mediana'], 60)
        .map((s) => s.text)
        .join(''),
    ).toBe('La mediana.');
  });
});

describe('el texto crudo de fórmulas y código', () => {
  it('junta lo que está entre signos $ y entre comillas invertidas', () => {
    expect(formulaText('El error es $s / sqrt(n)$ y se calcula con `sd(x)`.')).toBe(
      's / sqrt(n)\nsd(x)',
    );
  });

  it('sin fórmulas ni código no hay texto crudo', () => {
    expect(formulaText('Solo palabras.')).toBe('');
  });
});
