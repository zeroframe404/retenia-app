import { describe, expect, it } from 'vitest';
import {
  coverageSummary,
  type PageWord,
  pageWord,
  reviewGroups,
  sectionStates,
} from '../../src/core/materials/coverage';
import { isOfferableForCards } from '../../src/core/materials/eligibility';
import { texts } from '../../src/preload/contract/texts';

// El mapa de cobertura y la revisión de un material (H-27): cada página tiene color y palabra, la
// revisión las reparte en tres bloques y un bloque con problema o excluido no se ofrece para generar
// tarjetas.

const ready = { status: 'ready', excluded: false, openProblems: 0 } as const;

describe('palabra de cada página', () => {
  it('[CA-117] lista, revisar, pendiente, error y excluida', () => {
    expect(pageWord(ready)).toBe('ready');
    expect(pageWord({ ...ready, openProblems: 1 })).toBe('review');
    expect(pageWord({ ...ready, status: 'no_text' })).toBe('pending');
    expect(pageWord({ ...ready, status: 'pending' })).toBe('pending');
    expect(pageWord({ ...ready, status: 'review' })).toBe('error');
    expect(pageWord({ ...ready, excluded: true, openProblems: 3 })).toBe('excluded');
  });
});

describe('resumen de cobertura', () => {
  const elenco: PageWord[] = [
    'ready',
    'ready',
    'ready',
    'ready',
    'ready',
    'ready',
    'review',
    'ready',
    'pending',
    'ready',
    'review',
    'ready',
  ];

  it('[CA-117] el elenco da «9 de 12 páginas listas · 2 para revisar · 1 pendiente»', () => {
    const summary = coverageSummary(elenco);
    expect(summary).toEqual({ total: 12, ready: 9, review: 2, pending: 1, error: 0, excluded: 0 });
    expect(texts.materials.coverage.summary(summary)).toBe(
      '9 de 12 páginas listas · 2 para revisar · 1 pendiente',
    );
  });

  it('[CA-117] omite lo que está en cero y nombra el error y las excluidas', () => {
    expect(texts.materials.coverage.summary(coverageSummary(['ready', 'ready']))).toBe(
      '2 de 2 páginas listas',
    );
    expect(
      texts.materials.coverage.summary(coverageSummary(['ready', 'error', 'excluded', 'pending'])),
    ).toBe('1 de 4 páginas listas · 1 pendiente · 1 con error · 1 excluida');
    expect(
      texts.materials.coverage.summary(coverageSummary(['ready', 'excluded', 'excluded'])),
    ).toBe('1 de 3 páginas listas · 2 excluidas');
  });

  it('[CA-117] cada palabra del mapa sale del catálogo', () => {
    expect(texts.materials.coverage.words).toEqual({
      ready: 'Lista',
      review: 'Revisar',
      pending: 'Pendiente',
      error: 'Error',
      excluded: 'Excluida',
    });
  });
});

describe('los tres bloques de la revisión', () => {
  it('[CA-113] reparte las páginas en «Listo», «Con problemas» y «No extraído»', () => {
    const groups = reviewGroups([
      { unit: 1, status: 'ready', excluded: false, problems: [] },
      { unit: 7, status: 'ready', excluded: false, problems: [{ id: 'a', resolution: null }] },
      { unit: 9, status: 'no_text', excluded: false, problems: [] },
      { unit: 11, status: 'ready', excluded: false, problems: [{ id: 'b', resolution: null }] },
      { unit: 12, status: 'ready', excluded: false, problems: [] },
    ]);
    expect(groups.ready).toEqual([1, 12]);
    expect(groups.problems).toEqual([7, 11]);
    expect(groups.notExtracted).toEqual([9]);
    expect(groups.excluded).toEqual([]);
  });

  it('[CA-113] un problema resuelto (corregido, marcado o ignorado) no cuenta como abierto', () => {
    const groups = reviewGroups([
      {
        unit: 7,
        status: 'ready',
        excluded: false,
        problems: [{ id: 'a', resolution: 'corrected' }],
      },
    ]);
    expect(groups.ready).toEqual([7]);
    expect(groups.problems).toEqual([]);
  });

  it('[CA-118] una página excluida sale de los tres bloques', () => {
    const groups = reviewGroups([
      { unit: 9, status: 'no_text', excluded: true, problems: [] },
      { unit: 7, status: 'ready', excluded: true, problems: [{ id: 'a', resolution: null }] },
    ]);
    expect(groups).toEqual({ ready: [], problems: [], notExtracted: [], excluded: [9, 7] });
  });
});

describe('estado por sección', () => {
  const sections = [
    { id: 's1', from: 1, to: 3 },
    { id: 's2', from: 4, to: 7 },
    { id: 's3', from: 8, to: 9 },
    { id: 's4', from: 10, to: 12 },
  ];
  const words: Record<number, PageWord> = {
    1: 'ready',
    2: 'ready',
    3: 'ready',
    4: 'ready',
    5: 'ready',
    6: 'ready',
    7: 'review',
    8: 'ready',
    9: 'pending',
    10: 'excluded',
    11: 'excluded',
    12: 'excluded',
  };

  it('[CA-117] Lista, Con problemas y Excluida cuando no se está leyendo', () => {
    expect(sectionStates(sections, words, { working: false })).toEqual({
      s1: 'ready',
      s2: 'problems',
      s3: 'problems',
      s4: 'excluded',
    });
  });

  it('[CA-117] «En proceso» mientras el material se lee y la sección tiene páginas sin leer', () => {
    expect(sectionStates(sections, words, { working: true })).toMatchObject({
      s1: 'ready',
      s3: 'processing',
    });
  });

  it('[CA-117] los cuatro estados de sección salen del catálogo', () => {
    expect(texts.materials.sectionStates).toEqual({
      ready: 'Lista',
      processing: 'En proceso',
      problems: 'Con problemas',
      excluded: 'Excluida',
    });
  });
});

describe('qué se ofrece para generar tarjetas', () => {
  it('[CA-118] un bloque con problema abierto o en una página excluida no se ofrece', () => {
    expect(isOfferableForCards({ openProblem: false, excluded: false })).toBe(true);
    expect(isOfferableForCards({ openProblem: true, excluded: false })).toBe(false);
    expect(isOfferableForCards({ openProblem: false, excluded: true })).toBe(false);
    expect(isOfferableForCards({ openProblem: true, excluded: true })).toBe(false);
  });

  it('[CA-118] un bloque marcado como imagen tampoco se ofrece (no es texto)', () => {
    expect(isOfferableForCards({ openProblem: false, excluded: false, markedAsImage: true })).toBe(
      false,
    );
  });
});
