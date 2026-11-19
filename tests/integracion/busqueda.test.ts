import { afterEach, describe, expect, it } from 'vitest';
import type { Workspace } from '../../src/data/workspace';
import { seedDemoCardCast, seedDemoOrganization } from '../../src/main/demo/seed';
import { type SearchHit, searchQueryResponse } from '../../src/preload/contract/search';
import { readRows, runRaw } from '../apoyo/base-cruda';
import { closeSpaces, line, openSpace } from '../apoyo/espacio';

// La búsqueda (H-23): un índice por palabras y otro por pedazos de palabra sobre apuntes,
// tarjetas, temas y dudas, siempre al día con el contenido.

afterEach(closeSpaces);

function seeded() {
  const space = openSpace();
  seedDemoOrganization(space.workspace);
  seedDemoCardCast(space.workspace);
  return space;
}

const plain = (segments: readonly { text: string }[]) => segments.map((s) => s.text).join('');
const marked = (segments: readonly { text: string; match: boolean }[]) =>
  segments.filter((s) => s.match).map((s) => s.text);
const titles = (hits: readonly SearchHit[]) => hits.map((hit) => plain(hit.title));
const search = (workspace: Workspace, text: string) => workspace.search.query({ text }).results;

const subjectNamed = (workspace: Workspace, name: string) => {
  const found = workspace.subjects.list().subjects.find((subject) => subject.name === name);
  if (!found) {
    throw new Error(`falta la materia ${name}`);
  }
  return found;
};

const cardTitled = (workspace: Workspace, question: string) => {
  const found = workspace.cards.list().find((card) => card.question === question);
  if (!found) {
    throw new Error(`falta la tarjeta ${question}`);
  }
  return found;
};

describe('buscar en el elenco', () => {
  it('[CA-095] «desvio», sin tilde, devuelve primero «¿Qué mide el desvío estándar?» con la palabra resaltada', () => {
    const { workspace } = seeded();
    const [first] = search(workspace, 'desvio');
    expect(first?.kind).toBe('card');
    expect(plain(first?.title ?? [])).toBe('¿Qué mide el desvío estándar?');
    expect(marked(first?.title ?? [])).toEqual(['desvío']);
  });

  it('no distingue mayúsculas ni tildes: «DESVÍO», «desvío» y «desvio» dan lo mismo', () => {
    const { workspace } = seeded();
    const base = titles(search(workspace, 'desvio'));
    expect(base.length).toBeGreaterThan(3);
    expect(titles(search(workspace, 'DESVÍO'))).toEqual(base);
    expect(titles(search(workspace, 'desvío'))).toEqual(base);
  });

  it('[CA-096] «varian» encuentra los elementos que dicen «varianza»', () => {
    const { workspace } = seeded();
    const hits = search(workspace, 'varian');
    expect(titles(hits)).toContain('¿Qué es la varianza?');
    expect(
      hits.some((hit) => hit.kind === 'block' && plain(hit.fragment).includes('varianza')),
    ).toBe(true);
    for (const hit of hits) {
      expect(`${plain(hit.title)} ${plain(hit.fragment)}`.toLowerCase()).toContain('varian');
    }
  });

  it('un pedazo de 3 letras o más alcanza; de menos de 3, solo la palabra entera', () => {
    const { workspace } = seeded();
    expect(titles(search(workspace, 'var'))).toContain('¿Qué es la varianza?');
    expect(titles(search(workspace, 'va'))).not.toContain('¿Qué es la varianza?');
    const whole = search(workspace, 'n');
    expect(whole.length).toBeGreaterThan(0);
    for (const hit of whole) {
      expect(
        marked(hit.title)
          .concat(marked(hit.fragment))
          .map((m) => m.toLowerCase()),
      ).toContain('n');
    }
  });

  it('[CA-097] «sqrt(n» encuentra el renglón «s / sqrt(n)» de la nota «Intervalos de confianza»', () => {
    const { workspace } = seeded();
    const hits = search(workspace, 'sqrt(n');
    const row = hits.find((hit) => hit.kind === 'block' && plain(hit.fragment).includes('sqrt(n)'));
    expect(row).toBeDefined();
    expect(plain(row?.title ?? [])).toBe('Intervalos de confianza');
    expect(plain(row?.fragment ?? [])).toContain('s / sqrt(n)');
    expect(marked(row?.fragment ?? [])).toEqual(['sqrt(n']);
  });

  it('[CA-098] «tipo:tarjeta mediana» devuelve solo tarjetas', () => {
    const { workspace } = seeded();
    const hits = search(workspace, 'tipo:tarjeta mediana');
    expect(hits.length).toBeGreaterThan(0);
    expect(new Set(hits.map((hit) => hit.kind))).toEqual(new Set(['card']));
    expect(titles(hits)).toContain('¿Qué es la mediana?');
    // Sin el filtro aparecen también apuntes.
    expect(new Set(search(workspace, 'media').map((hit) => hit.kind)).size).toBeGreaterThan(1);
  });

  it('[CA-098] «materia:historia mayo» devuelve la tarjeta de la Revolución de Mayo, y solo de esa materia', () => {
    const { workspace } = seeded();
    const hits = search(workspace, 'materia:historia mayo');
    const history = subjectNamed(workspace, 'Historia argentina');
    expect(titles(hits)).toContain('¿En qué año fue la Revolución de Mayo?');
    expect(hits.every((hit) => hit.subjectId === history.id)).toBe(true);
  });

  it('«tema:» filtra por tema, también por uno de sus nombres viejos', () => {
    const { workspace } = seeded();
    const stats = subjectNamed(workspace, 'Estadística básica');
    const topic = workspace.topics
      .list({ subjectId: stats.id })
      .topics.find((t) => t.name === 'Media y dispersión');
    const hits = search(workspace, 'tema:"media y dispersion" tipo:tarjeta varianza');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.topicId === topic?.id)).toBe(true);
    workspace.topics.rename({ topicId: topic?.id ?? '', name: 'Medidas de resumen' });
    expect(search(workspace, 'tema:"media y dispersion" tipo:tarjeta varianza').length).toBe(
      hits.length,
    );
  });

  it('un filtro de materia que no existe no devuelve nada', () => {
    const { workspace } = seeded();
    expect(search(workspace, 'materia:zzzz mediana')).toEqual([]);
    expect(search(workspace, 'tipo:marciano mediana')).toEqual([]);
  });

  it('[CA-099] con el tema renombrado a «Medidas de resumen», «Media y dispersión» lo encuentra igual', () => {
    const { workspace } = seeded();
    const stats = subjectNamed(workspace, 'Estadística básica');
    const topic = workspace.topics
      .list({ subjectId: stats.id })
      .topics.find((t) => t.name === 'Media y dispersión');
    workspace.topics.rename({ topicId: topic?.id ?? '', name: 'Medidas de resumen' });

    const [first] = search(workspace, 'Media y dispersión');

    expect(first?.kind).toBe('topic');
    expect(plain(first?.title ?? [])).toBe('Medidas de resumen');
    expect(first?.entityId).toBe(topic?.id);
    expect(titles(search(workspace, 'medidas de resumen'))[0]).toBe('Medidas de resumen');
  });

  it('[CA-100] la nota «Teorema de Bayes» aparece al buscar «bayes» apenas se guarda', () => {
    const { workspace } = seeded();
    const stats = subjectNamed(workspace, 'Estadística básica');
    expect(search(workspace, 'bayes')).toEqual([]);

    const note = workspace.notes.create({ subjectId: stats.id, topicId: null });
    workspace.notes.save({
      noteId: note.id,
      title: 'Teorema de Bayes',
      blocks: [line('Actualiza una probabilidad con evidencia nueva.', { id: note.blocks[0]?.id })],
    });

    const hits = search(workspace, 'bayes');
    expect(hits.map((hit) => [hit.kind, plain(hit.title)])).toEqual([['note', 'Teorema de Bayes']]);
    expect(hits[0]?.entityId).toBe(note.id);
  });

  it('[CA-101] una búsqueda sin resultados devuelve la lista vacía', () => {
    const { workspace } = seeded();
    expect(workspace.search.query({ text: 'zzzz' })).toEqual({ results: [], recent: false });
  });

  it('cada resultado dice de qué materia y tema es', () => {
    const { workspace } = seeded();
    const [first] = search(workspace, 'desvio');
    expect(first?.subjectName).toBe('Estadística básica');
    expect(first?.topicName).toBe('Media y dispersión');
  });
});

describe('el orden de los resultados', () => {
  function twoSubjects() {
    const space = openSpace();
    const alpha = space.workspace.subjects.create({ name: 'Alfa', makeActive: true });
    const beta = space.workspace.subjects.create({ name: 'Beta', makeActive: false });
    return { ...space, alpha, beta };
  }

  it('la coincidencia exacta de título va primero', () => {
    const { workspace, alpha } = twoSubjects();
    workspace.cards.create({
      question: 'La mediana separa los datos en dos mitades iguales',
      answer: 'mediana mediana mediana',
      subjectId: alpha.id,
    });
    const exact = workspace.cards.create({
      question: 'Mediana',
      answer: 'El valor central.',
      subjectId: alpha.id,
    });
    expect(search(workspace, 'mediana')[0]?.entityId).toBe(exact.id);
  });

  it('un nombre viejo de un tema es una coincidencia exacta', () => {
    const { workspace, alpha } = twoSubjects();
    workspace.cards.create({
      question: 'Algo que habla de Dispersión y media',
      answer: 'Dispersión y media',
      subjectId: alpha.id,
    });
    const topic = workspace.topics.create({ subjectId: alpha.id, name: 'Dispersión y media' });
    workspace.topics.rename({ topicId: topic.id, name: 'Medidas de resumen' });
    expect(search(workspace, 'Dispersión y media')[0]?.entityId).toBe(topic.id);
  });

  it('a igual relevancia, la materia activa antes que las otras', () => {
    const { workspace, alpha, beta } = twoSubjects();
    const inBeta = workspace.cards.create({
      question: 'Qué es una moda',
      answer: 'x',
      subjectId: beta.id,
    });
    const inAlpha = workspace.cards.create({
      question: 'Qué es una moda',
      answer: 'x',
      subjectId: alpha.id,
    });
    expect(search(workspace, 'moda').map((hit) => hit.entityId)).toEqual([inAlpha.id, inBeta.id]);
  });

  it('a igual relevancia, lo abierto hace poco antes que lo viejo', () => {
    const { workspace, alpha } = twoSubjects();
    const first = workspace.cards.create({
      question: 'Qué es un cuartil',
      answer: 'x',
      subjectId: alpha.id,
    });
    const second = workspace.cards.create({
      question: 'Qué es un cuartil',
      answer: 'x',
      subjectId: alpha.id,
    });
    const before = search(workspace, 'cuartil').map((hit) => hit.entityId);
    const opened = before.at(-1) ?? '';
    workspace.search.opened({ docId: `card:${opened}` });
    const after = search(workspace, 'cuartil').map((hit) => hit.entityId);
    expect(after[0]).toBe(opened);
    expect([first.id, second.id].sort()).toEqual([...after].sort());
  });

  it('a igual relevancia, lo archivado al final', () => {
    const { workspace, alpha } = twoSubjects();
    const archived = workspace.notes.create({ subjectId: alpha.id, topicId: null });
    workspace.notes.save({
      noteId: archived.id,
      title: 'Percentiles',
      blocks: [line('', { id: archived.blocks[0]?.id })],
    });
    const live = workspace.notes.create({ subjectId: alpha.id, topicId: null });
    workspace.notes.save({
      noteId: live.id,
      title: 'Percentiles',
      blocks: [line('', { id: live.blocks[0]?.id })],
    });
    workspace.notes.archive({ noteId: archived.id });
    const hits = search(workspace, 'percentiles');
    expect(hits.map((hit) => hit.entityId)).toEqual([live.id, archived.id]);
    expect(hits.map((hit) => hit.archived)).toEqual([false, true]);
  });

  it('el título pesa más que el cuerpo', () => {
    const { workspace, alpha } = twoSubjects();
    workspace.cards.create({
      question: 'Una pregunta cualquiera sobre otro tema',
      answer: 'La covarianza mide cómo varían juntas dos variables',
      subjectId: alpha.id,
    });
    const inTitle = workspace.cards.create({
      question: 'Qué mide la covarianza entre dos variables aleatorias',
      answer: 'Otra cosa',
      subjectId: alpha.id,
    });
    expect(search(workspace, 'covarianza')[0]?.entityId).toBe(inTitle.id);
  });

  it('sin texto muestra lo abierto hace poco, lo más reciente primero', () => {
    const { workspace, alpha } = twoSubjects();
    const a = workspace.cards.create({ question: 'Alfa uno', answer: 'x', subjectId: alpha.id });
    const b = workspace.cards.create({ question: 'Alfa dos', answer: 'x', subjectId: alpha.id });
    expect(workspace.search.query({ text: '' })).toEqual({ results: [], recent: true });
    workspace.search.opened({ docId: `card:${a.id}` });
    workspace.search.opened({ docId: `card:${b.id}` });
    workspace.search.opened({ docId: `card:${a.id}` });
    const recent = workspace.search.query({ text: '   ' });
    expect(recent.recent).toBe(true);
    expect(recent.results.map((hit) => hit.entityId)).toEqual([a.id, b.id]);
  });

  it('lo abierto que ya no existe no aparece entre lo reciente', () => {
    const { workspace, alpha } = twoSubjects();
    const card = workspace.cards.create({ question: 'Alfa uno', answer: 'x', subjectId: alpha.id });
    workspace.search.opened({ docId: `card:${card.id}` });
    workspace.cards.remove({ cardId: card.id });
    expect(workspace.search.query({ text: '' }).results).toEqual([]);
  });
});

describe('el índice sigue al contenido', () => {
  it('editar una tarjeta cambia lo que se encuentra', () => {
    const { workspace } = seeded();
    const card = cardTitled(workspace, '¿Qué es la varianza?');
    expect(titles(search(workspace, 'promedio de los cuadrados'))).toContain(
      plain([{ text: card.question }]),
    );
    workspace.cards.edit({
      cardId: card.id,
      question: '¿Qué es la dispersión cuadrática?',
      answer: 'Otra cosa distinta.',
      meaningChanged: false,
    });
    expect(titles(search(workspace, 'dispersión cuadrática'))).toContain(
      '¿Qué es la dispersión cuadrática?',
    );
    expect(titles(search(workspace, 'promedio de los cuadrados'))).not.toContain(
      '¿Qué es la varianza?',
    );
    expect(titles(search(workspace, 'qué es la varianza'))).not.toContain('¿Qué es la varianza?');
  });

  it('borrar una tarjeta la saca de los resultados y restaurarla la devuelve', () => {
    const { workspace } = seeded();
    const card = cardTitled(workspace, '¿Qué mide el desvío estándar?');
    const { trashEntryId } = workspace.cards.remove({ cardId: card.id });
    expect(titles(search(workspace, 'desvio'))).not.toContain(card.question);
    workspace.trash.restore({ entryId: trashEntryId });
    expect(search(workspace, 'desvio')[0]?.entityId).toBe(card.id);
  });

  it('borrar una nota saca la nota y sus renglones, y restaurarla los devuelve', () => {
    const { workspace } = seeded();
    const stats = subjectNamed(workspace, 'Estadística básica');
    const summary = workspace.notes
      .list({ subjectId: stats.id })
      .notes.find((n) => n.title === 'Intervalos de confianza');
    const { trashEntryId } = workspace.notes.remove({ noteId: summary?.id ?? '' });
    expect(search(workspace, 'sqrt(n')).toEqual([]);
    expect(titles(search(workspace, 'tipo:apunte intervalos de confianza'))).not.toContain(
      'Intervalos de confianza',
    );
    workspace.trash.restore({ entryId: trashEntryId });
    expect(search(workspace, 'sqrt(n').length).toBeGreaterThan(0);
    expect(titles(search(workspace, 'tipo:apunte intervalos de confianza'))).toContain(
      'Intervalos de confianza',
    );
  });

  it('renombrar una nota cambia el título de sus renglones en los resultados', () => {
    const { workspace } = seeded();
    const stats = subjectNamed(workspace, 'Estadística básica');
    const summary = workspace.notes
      .list({ subjectId: stats.id })
      .notes.find((n) => n.title === 'Intervalos de confianza');
    const note = workspace.notes.get({ noteId: summary?.id ?? '' });
    workspace.notes.save({
      noteId: note.id,
      title: 'Estimación por intervalos',
      blocks: note.blocks,
    });
    const row = search(workspace, 'sqrt(n').find((hit) => hit.kind === 'block');
    expect(plain(row?.title ?? [])).toBe('Estimación por intervalos');
  });

  it('archivar y mover una nota se refleja en los resultados', () => {
    const { workspace } = seeded();
    const stats = subjectNamed(workspace, 'Estadística básica');
    const summary = workspace.notes
      .list({ subjectId: stats.id })
      .notes.find((n) => n.title === 'Intervalos de confianza');
    workspace.notes.archive({ noteId: summary?.id ?? '' });
    const row = search(workspace, 'sqrt(n').find((hit) => hit.kind === 'block');
    expect(row?.archived).toBe(true);
  });

  it('las dudas guardadas se encuentran con «tipo:duda»', () => {
    const { workspace } = seeded();
    const card = cardTitled(workspace, '¿Qué es la varianza?');
    workspace.doubts.create({
      doubtId: '0190a000-0000-7000-8000-000000000001',
      text: 'No entiendo por qué se eleva al cuadrado',
      cardId: card.id,
      sessionId: null,
    });
    const hits = search(workspace, 'tipo:duda cuadrado');
    expect(hits.map((hit) => [hit.kind, plain(hit.title)])).toEqual([
      ['doubt', 'No entiendo por qué se eleva al cuadrado'],
    ]);
    expect(hits[0]?.subjectName).toBe('Estadística básica');
  });

  it('después de cada escritura no queda nada pendiente de indexar: se hizo en la misma transacción', () => {
    const space = seeded();
    const { workspace, file } = space;
    const stats = subjectNamed(workspace, 'Estadística básica');
    const note = workspace.notes.create({ subjectId: stats.id, topicId: null });
    workspace.notes.save({
      noteId: note.id,
      title: 'Una nota',
      blocks: [line('texto nuevo', { id: note.blocks[0]?.id })],
    });
    workspace.cards.create({ question: 'Otra', answer: 'x', subjectId: stats.id });
    expect(readRows(file, 'SELECT COUNT(*) AS n FROM search_dirty')).toEqual([{ n: 0 }]);
    const docs = readRows(file, 'SELECT COUNT(*) AS n FROM search_documents')[0]?.n as number;
    expect(readRows(file, 'SELECT COUNT(*) AS n FROM search_words')).toEqual([{ n: docs }]);
    expect(readRows(file, 'SELECT COUNT(*) AS n FROM search_pieces')).toEqual([{ n: docs }]);
  });

  it('el índice sobrevive al cierre: al abrir de nuevo encuentra lo mismo', () => {
    const space = seeded();
    const before = titles(search(space.workspace, 'desvio'));
    const reopened = space.reopen();
    expect(titles(search(reopened, 'desvio'))).toEqual(before);
  });

  it('una base sin índice (como una copia de antes de la búsqueda) lo arma al abrir', () => {
    const space = seeded();
    const before = titles(search(space.workspace, 'desvio'));
    space.workspace.close();
    runRaw(space.file, 'DROP TABLE search_words');
    runRaw(space.file, 'DROP TABLE search_pieces');
    runRaw(space.file, 'DELETE FROM search_documents');
    const reopened = space.reopen();
    expect(titles(search(reopened, 'desvio'))).toEqual(before);
  });
});

describe('reconstruir y verificar el índice', () => {
  it('«Reconstruir índice de búsqueda» deja el índice como corresponde y cuenta lo que indexó', () => {
    const space = seeded();
    const { workspace, file } = space;
    const expected = readRows(file, 'SELECT COUNT(*) AS n FROM search_documents')[0]?.n as number;
    expect(expected).toBeGreaterThan(190);
    expect(workspace.search.rebuild()).toEqual({ documents: expected });
    expect(workspace.search.verify()).toEqual([]);
  });

  it('«Verificar datos» también compara el índice con el contenido y lo dice si no coincide', () => {
    const space = seeded();
    const { workspace, file } = space;
    expect(workspace.verifyData()).toEqual([]);
    runRaw(file, "DELETE FROM search_documents WHERE doc_id LIKE 'card:%' AND rowid % 7 = 0");
    const differences = workspace.verifyData();
    expect(differences.length).toBeGreaterThan(0);
    expect(new Set(differences.map((difference) => difference.kind))).toEqual(new Set(['search']));
    workspace.repairData();
    expect(workspace.verifyData()).toEqual([]);
    expect(titles(search(workspace, 'desvio'))[0]).toBe('¿Qué mide el desvío estándar?');
  });

  it('un índice de pedazos que perdió filas también se detecta', () => {
    const space = seeded();
    const { workspace, file } = space;
    runRaw(file, 'DELETE FROM search_pieces WHERE rowid % 5 = 0');
    expect(workspace.search.verify().length).toBeGreaterThan(0);
    workspace.search.rebuild();
    expect(workspace.search.verify()).toEqual([]);
  });
});

describe('una búsqueda rara no rompe nada', () => {
  const odd = [
    '"*()[]',
    '"',
    "'",
    '*',
    'a OR b',
    'NEAR(a b)',
    'varianza AND',
    '-media',
    '^media',
    'media:',
    'tipo:',
    'materia:"',
    'col:media',
    '\\',
    '%_',
    "'; DROP TABLE cards; --",
    '\u0000media',
    'x'.repeat(5000),
    `${'media '.repeat(500)}`,
    '🙂 media',
  ];

  it.for(odd)('«%s» no da error: da resultados o lista vacía', (text) => {
    const { workspace } = seeded();
    expect(() => workspace.search.query({ text })).not.toThrow();
    const { results } = workspace.search.query({ text });
    expect(Array.isArray(results)).toBe(true);
  });

  it('las comillas y los símbolos se buscan como texto', () => {
    const { workspace } = seeded();
    const stats = subjectNamed(workspace, 'Estadística básica');
    workspace.cards.create({
      question: 'Qué hace f(x) = "a*b" [1]',
      answer: 'Multiplica',
      subjectId: stats.id,
    });
    expect(titles(search(workspace, '"a*b"'))).toEqual(['Qué hace f(x) = "a*b" [1]']);
    expect(titles(search(workspace, 'f(x) = "a*b" [1]'))).toEqual(['Qué hace f(x) = "a*b" [1]']);
  });
});

describe('lo que objetó la revisión independiente', () => {
  it('una tarjeta con una pregunta larguísima se encuentra y la respuesta cumple el contrato', () => {
    const space = openSpace();
    const subject = space.workspace.subjects.create({ name: 'Alfa', makeActive: true });
    space.workspace.cards.create({
      question: `zorro ${'palabra '.repeat(200)}`,
      answer: 'x',
      subjectId: subject.id,
    });
    const response = space.workspace.search.query({ text: 'zorro' });
    expect(response.results).toHaveLength(1);
    expect(searchQueryResponse.safeParse(response).success).toBe(true);
  });

  it('una duda larga también', () => {
    const space = openSpace();
    const subject = space.workspace.subjects.create({ name: 'Alfa', makeActive: true });
    const card = space.workspace.cards.create({
      question: 'Uno',
      answer: 'x',
      subjectId: subject.id,
    });
    space.workspace.doubts.create({
      doubtId: '0190a000-0000-7000-8000-000000000002',
      text: `lobo ${'duda '.repeat(300)}`,
      cardId: card.id,
      sessionId: null,
    });
    const response = space.workspace.search.query({ text: 'tipo:duda lobo' });
    expect(response.results).toHaveLength(1);
    expect(searchQueryResponse.safeParse(response).success).toBe(true);
  });

  it('una duda guardada deja el índice al día: nada pendiente y «Verificar datos» en 0 diferencias', () => {
    const space = openSpace();
    const subject = space.workspace.subjects.create({ name: 'Alfa', makeActive: true });
    const card = space.workspace.cards.create({
      question: 'Uno',
      answer: 'x',
      subjectId: subject.id,
    });
    space.workspace.doubts.create({
      doubtId: '0190a000-0000-7000-8000-000000000003',
      text: 'Una duda',
      cardId: card.id,
      sessionId: null,
    });
    expect(readRows(space.file, 'SELECT COUNT(*) AS n FROM search_dirty')).toEqual([{ n: 0 }]);
    expect(space.workspace.verifyData()).toEqual([]);
  });

  it('si la tarjeta de una duda cambia de tema, la duda se encuentra en el tema nuevo y no en el viejo', () => {
    const space = openSpace();
    const { workspace } = space;
    const subject = workspace.subjects.create({ name: 'Alfa', makeActive: true });
    const one = workspace.topics.create({ subjectId: subject.id, name: 'Uno' });
    const two = workspace.topics.create({ subjectId: subject.id, name: 'Dos' });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: one.id });
    workspace.notes.save({
      noteId: note.id,
      title: 'Una nota',
      blocks: [line('Pregunta >> Respuesta', { id: note.blocks[0]?.id })],
    });
    const card = workspace.cards.list({ subjectId: subject.id })[0];
    workspace.doubts.create({
      doubtId: '0190a000-0000-7000-8000-000000000004',
      text: 'No entiendo la pregunta',
      cardId: card?.id ?? null,
      sessionId: null,
    });
    expect(search(workspace, 'tipo:duda tema:Uno')).toHaveLength(1);
    workspace.notes.move({ noteId: note.id, topicId: two.id });
    expect(search(workspace, 'tipo:duda tema:Dos')).toHaveLength(1);
    expect(search(workspace, 'tipo:duda tema:Uno')).toHaveLength(0);
    expect(workspace.verifyData()).toEqual([]);
  });

  it('el nombre viejo de un tema va primero aunque más de mil tarjetas digan lo mismo en su título', () => {
    const space = openSpace();
    const { workspace } = space;
    const subject = workspace.subjects.create({ name: 'Alfa', makeActive: true });
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Cálculo uno' });
    workspace.topics.rename({ topicId: topic.id, name: 'Análisis matemático' });
    workspace.cards.plantCast(
      Array.from({ length: 1200 }, (_, index) => ({
        question: `Calculo uno ejercicio ${index}`,
        answer: 'x',
        kind: 'qa' as const,
        subjectId: subject.id,
        topicId: topic.id,
        createdAt: new Date('2027-01-01T00:00:00Z'),
        reviews: [],
      })),
    );
    expect(search(workspace, 'Cálculo uno')[0]?.entityId).toBe(topic.id);
  });

  it('«Verificar datos» detecta que a una fila del índice le cambiaron el tipo o a qué apunta', () => {
    const space = seeded();
    const { workspace, file } = space;
    runRaw(
      file,
      "UPDATE search_documents SET kind = 'note' WHERE doc_id LIKE 'card:%' AND rowid % 11 = 0",
    );
    expect(workspace.verifyData().length).toBeGreaterThan(0);
    workspace.repairData();
    runRaw(
      file,
      "UPDATE search_documents SET entity_id = 'x' WHERE doc_id LIKE 'card:%' AND rowid % 11 = 0",
    );
    expect(workspace.verifyData().length).toBeGreaterThan(0);
    workspace.repairData();
    expect(workspace.verifyData()).toEqual([]);
  });

  it('una nota cuyo tema está en la Papelera no muestra el nombre del tema borrado', () => {
    const space = openSpace();
    const { workspace } = space;
    const subject = workspace.subjects.create({ name: 'Alfa', makeActive: true });
    const topic = workspace.topics.create({ subjectId: subject.id, name: 'Tema borrado' });
    const note = workspace.notes.create({ subjectId: subject.id, topicId: topic.id });
    workspace.notes.save({
      noteId: note.id,
      title: 'Apunte suelto',
      blocks: [line('', { id: note.blocks[0]?.id })],
    });
    workspace.topics.remove({ topicId: topic.id });
    expect(search(workspace, 'suelto')[0]?.topicName).toBeNull();
  });
});
