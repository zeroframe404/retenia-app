import type { UnitStatus } from './status';

// El mapa de cobertura y la revisión de un material (H-27): qué palabra lleva cada página, cómo se
// reparten en los tres bloques de la revisión y en qué estado queda cada sección.

export type PageWord = 'ready' | 'review' | 'pending' | 'error' | 'excluded';

export type ProblemResolution = 'corrected' | 'image' | 'ignored' | 'conflict';

// Un problema sigue abierto si nadie lo resolvió o si su corrección quedó «En conflicto».
export const isOpenProblem = (resolution: ProblemResolution | null) =>
  resolution === null || resolution === 'conflict';

export function pageWord({
  status,
  excluded,
  openProblems,
}: {
  status: UnitStatus;
  excluded: boolean;
  openProblems: number;
}): PageWord {
  if (excluded) {
    return 'excluded';
  }
  if (status === 'review') {
    return 'error';
  }
  if (status === 'pending' || status === 'no_text') {
    return 'pending';
  }
  return openProblems > 0 ? 'review' : 'ready';
}

export interface CoverageSummary {
  total: number;
  ready: number;
  review: number;
  pending: number;
  error: number;
  excluded: number;
}

export function coverageSummary(words: readonly PageWord[]): CoverageSummary {
  const summary: CoverageSummary = {
    total: words.length,
    ready: 0,
    review: 0,
    pending: 0,
    error: 0,
    excluded: 0,
  };
  for (const word of words) {
    summary[word]++;
  }
  return summary;
}

export interface ReviewUnit {
  unit: number;
  status: UnitStatus;
  excluded: boolean;
  problems: readonly { id: string; resolution: ProblemResolution | null }[];
}

export interface ReviewGroups {
  // Listo: páginas leídas y sin nada abierto.
  ready: number[];
  // Con problemas: páginas leídas con alguna señal sin resolver.
  problems: number[];
  // No extraído: sin texto, todavía sin leer o que no se pudo leer.
  notExtracted: number[];
  excluded: number[];
}

export function reviewGroups(units: readonly ReviewUnit[]): ReviewGroups {
  const groups: ReviewGroups = { ready: [], problems: [], notExtracted: [], excluded: [] };
  for (const entry of units) {
    if (entry.excluded) {
      groups.excluded.push(entry.unit);
    } else if (entry.status !== 'ready') {
      groups.notExtracted.push(entry.unit);
    } else if (entry.problems.some((problem) => isOpenProblem(problem.resolution))) {
      groups.problems.push(entry.unit);
    } else {
      groups.ready.push(entry.unit);
    }
  }
  return groups;
}

export type SectionState = 'ready' | 'processing' | 'problems' | 'excluded';

// El estado de cada sección (desde la página `from` hasta la `to`): Excluida si todas sus páginas
// lo están; En proceso si todavía se está leyendo y le falta alguna; Con problemas si alguna
// página pide revisión o no tiene texto; Lista si no.
export function sectionStates(
  sections: readonly { id: string; from: number; to: number }[],
  words: Readonly<Record<number, PageWord>>,
  { working }: { working: boolean },
): Record<string, SectionState> {
  const states: Record<string, SectionState> = {};
  for (const section of sections) {
    const pages: PageWord[] = [];
    for (let unit = section.from; unit <= section.to; unit++) {
      pages.push(words[unit] ?? 'pending');
    }
    if (pages.length > 0 && pages.every((word) => word === 'excluded')) {
      states[section.id] = 'excluded';
    } else if (working && pages.includes('pending')) {
      states[section.id] = 'processing';
    } else if (pages.some((word) => word === 'review' || word === 'error' || word === 'pending')) {
      states[section.id] = 'problems';
    } else {
      states[section.id] = 'ready';
    }
  }
  return states;
}
