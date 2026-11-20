import { diffSegments, occurrenceKeys } from '../../core/materials/corrections';
import {
  coverageSummary,
  isOpenProblem,
  type PageWord,
  type ProblemResolution,
  pageWord,
  reviewGroups,
  sectionStates,
} from '../../core/materials/coverage';
import { isOfferableForCards } from '../../core/materials/eligibility';
import { blockSignals, textLayer, unitSignals } from '../../core/materials/quality';
import type { BlockRow, CorrectionRow, ResolutionRow, UnitRow } from '../../data/materials';
import type {
  MaterialReview,
  MaterialSummary,
  ReviewProblem,
} from '../../preload/contract/materials';

// La revisión de un material (H-27), armada con lo que hay en la base: las señales de cada página
// y de cada bloque, lo que corregiste o decidiste, los tres bloques de la pantalla, el mapa de
// cobertura y el estado de cada sección. Todo se calcula al mirar: nada de esto se guarda aparte.

// Los bloques que pueden llevar una señal (los títulos, las figuras y los encabezados no).
const CHECKED_TYPES = new Set(['paragraph', 'list', 'table', 'formula', 'code']);
// Los bloques que, si no tienen problemas, se ofrecen para generar tarjetas.
const OFFERABLE_TYPES = new Set(['paragraph', 'list', 'table', 'formula', 'code']);
const EXCERPT = 120;

export interface ReviewInput {
  // El tipo del material: en un PDF una tabla o una fórmula puede ser una mala lectura; en Word,
  // Markdown o una página web no hay lectura que dudar.
  materialKind: string | null;
  units: readonly UnitRow[];
  blocks: readonly BlockRow[];
  corrections: readonly CorrectionRow[];
  resolutions: readonly ResolutionRow[];
}

export interface Info {
  id: string;
  unit: number;
  type: string;
  level: number;
  position: number;
  base: string;
  current: string;
  key: string;
}

const collapse = (text: string) => text.replace(/\s+/gu, ' ').trim();
const excerptOf = (text: string) => {
  const flat = collapse(text);
  return flat.length > EXCERPT ? `${flat.slice(0, EXCERPT - 1).trimEnd()}…` : flat;
};

export const infosOf = (blocks: readonly BlockRow[]): Info[] => {
  const keys = occurrenceKeys(
    blocks.map((row) => ({
      unit: row.unitNo,
      type: row.type,
      base: row.baseText ?? row.normalizedText,
    })),
  );
  return blocks.map((row, index) => ({
    id: row.id,
    unit: row.unitNo,
    type: row.type,
    level: row.level,
    position: row.position,
    base: row.baseText ?? row.normalizedText,
    current: row.normalizedText,
    key: keys[index] as string,
  }));
};

const tokens = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

// El bloque de la página que más se parece al texto de base de antes: sobre él se muestra un
// conflicto.
export function closestBlock<T extends { base: string }>(before: string, candidates: readonly T[]) {
  const wanted = tokens(before);
  let best: T | undefined;
  let bestScore = -1;
  for (const candidate of candidates) {
    const other = tokens(candidate.base);
    let shared = 0;
    for (const token of wanted) {
      if (other.has(token)) {
        shared++;
      }
    }
    const score = shared / Math.max(1, wanted.size + other.size - shared);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

const resolutionOf = (
  resolutions: readonly ResolutionRow[],
  unit: number,
  key: string,
): ProblemResolution | null => {
  const found = resolutions.find((row) => row.unitNo === unit && row.problemKey === key);
  return found ? (found.resolution as ProblemResolution) : null;
};

// Los problemas de un material: uno por cada bloque con señal y uno por cada página con una señal
// propia (poco texto para su tamaño, reconocimiento dudoso). Un problema resuelto sigue en la lista.
function problemsOf({ materialKind, units, blocks, corrections, resolutions }: ReviewInput) {
  const infos = infosOf(blocks);
  const byUnit = new Map(units.map((unit) => [unit.unitNo, unit]));
  const problems = new Map<string, ReviewProblem>();

  for (const unit of units) {
    if (unit.status !== 'ready') {
      continue;
    }
    const signals = unitSignals({
      chars: unit.charCount,
      width: unit.width,
      height: unit.height,
      ocrConfidence: unit.textSource === 'ocr' ? unit.ocrConfidence : null,
    });
    if (signals.length > 0) {
      const id = `${unit.unitNo}:unit`;
      problems.set(id, {
        id,
        unit: unit.unitNo,
        blockId: null,
        signals,
        excerpt: '',
        original: '',
        current: '',
        resolution: resolutionOf(resolutions, unit.unitNo, 'unit'),
        correctionId: null,
        cardsPending: 0,
        diff: null,
        actions: ['viewOriginal', 'markAsImage', 'ignore'],
        conflict: null,
      });
    }
  }

  for (const info of infos) {
    const unit = byUnit.get(info.unit);
    if (unit?.status !== 'ready' || !CHECKED_TYPES.has(info.type)) {
      continue;
    }
    // Solo en un PDF una tabla o una fórmula puede ser una mala lectura.
    const signals = blockSignals({ type: info.type as never, text: info.base }).filter(
      (signal) =>
        materialKind === 'pdf' || (signal !== 'possibleTable' && signal !== 'possibleFormula'),
    );
    const id = `${info.unit}:${info.key}`;
    if (signals.length === 0 || problems.has(id)) {
      continue;
    }
    const correction = corrections.find(
      (row) => row.unitNo === info.unit && row.blockKey === info.key && row.state === 'applied',
    );
    problems.set(id, {
      id,
      unit: info.unit,
      blockId: info.id,
      signals,
      excerpt: excerptOf(info.current),
      original: info.base,
      current: info.current,
      resolution: correction ? 'corrected' : resolutionOf(resolutions, info.unit, info.key),
      correctionId: correction?.id ?? null,
      cardsPending: correction ? (JSON.parse(correction.pendingCards) as string[]).length : 0,
      diff:
        correction && info.current !== info.base
          ? {
              original: diffSegments(info.current, info.base),
              corrected: diffSegments(info.base, info.current),
            }
          : null,
      actions: ['viewOriginal', 'correctText', 'markAsImage', 'ignore'],
      conflict: null,
    });
  }

  for (const correction of corrections.filter((row) => row.state === 'conflict')) {
    const here = infos.filter(
      (info) => info.unit === correction.unitNo && CHECKED_TYPES.has(info.type),
    );
    const candidate = closestBlock(correction.beforeText, here);
    const current = candidate?.base ?? '';
    const conflict = {
      mine: correction.afterText,
      current,
      differences: diffSegments(current, correction.afterText),
    };
    const id = `${correction.unitNo}:${candidate?.key ?? correction.blockKey}`;
    const existing = problems.get(id);
    problems.set(id, {
      id,
      unit: correction.unitNo,
      blockId: candidate?.id ?? null,
      signals: existing?.signals ?? [],
      excerpt: excerptOf(current),
      original: current,
      current,
      resolution: 'conflict',
      correctionId: correction.id,
      cardsPending: 0,
      diff: null,
      actions: ['viewOriginal', 'correctText'],
      conflict,
    });
  }

  return [...problems.values()].sort(
    (a, b) => a.unit - b.unit || (a.blockId === null ? -1 : 0) - (b.blockId === null ? -1 : 0),
  );
}

export function buildReview({
  materialId,
  title,
  kind,
  summary,
  working,
  ...input
}: ReviewInput & {
  materialId: string;
  title: string;
  kind: MaterialReview['kind'];
  summary: MaterialSummary;
  working: boolean;
}): MaterialReview {
  const { units, blocks } = input;
  const problems = problemsOf(input);
  const openByUnit = new Map<number, number>();
  for (const problem of problems) {
    if (isOpenProblem(problem.resolution)) {
      openByUnit.set(problem.unit, (openByUnit.get(problem.unit) ?? 0) + 1);
    }
  }
  const groups = reviewGroups(
    units.map((unit) => ({
      unit: unit.unitNo,
      status: unit.status as UnitRow['status'] & ('pending' | 'ready' | 'no_text' | 'review'),
      excluded: unit.excluded === 1,
      problems: problems
        .filter((problem) => problem.unit === unit.unitNo)
        .map((problem) => ({ id: problem.id, resolution: problem.resolution })),
    })),
  );

  const words: Record<number, PageWord> = {};
  for (const unit of units) {
    words[unit.unitNo] = pageWord({
      status: unit.status as 'pending' | 'ready' | 'no_text' | 'review',
      excluded: unit.excluded === 1,
      openProblems: openByUnit.get(unit.unitNo) ?? 0,
    });
  }

  const infos = infosOf(blocks);
  const lastUnit = Math.max(1, ...units.map((unit) => unit.unitNo));
  const sectionInfos = infos.filter((info) => info.type === 'section');
  const spans = sectionInfos.map((section, index) => {
    const next = sectionInfos
      .slice(index + 1)
      .find((candidate) => candidate.level <= Math.max(1, section.level));
    const to = next ? Math.max(section.unit, next.unit) : lastUnit;
    return { id: section.id, from: section.unit, to };
  });
  const states = sectionStates(spans, words, { working });
  const sections = sectionInfos.map((section, index) => ({
    blockId: section.id,
    title: collapse(section.current),
    level: Math.max(1, section.level),
    from: spans[index]?.from ?? section.unit,
    to: spans[index]?.to ?? section.unit,
    state: states[section.id] ?? ('ready' as const),
  }));

  const unitById = new Map(units.map((unit) => [unit.unitNo, unit]));
  const notExtracted = groups.notExtracted.map((unitNo) => {
    const unit = unitById.get(unitNo);
    const status = unit?.status ?? 'pending';
    const reason =
      status === 'review'
        ? ('error' as const)
        : status === 'pending'
          ? ('pending' as const)
          : textLayer({
                chars: unit?.charCount ?? 0,
                width: unit?.width ?? null,
                height: unit?.height ?? null,
              }) === 'none'
            ? ('none' as const)
            : ('sparse' as const);
    return {
      unit: unitNo,
      reason,
      working: status === 'pending' && working,
      actions:
        reason === 'pending'
          ? []
          : reason === 'error'
            ? (['reprocess', 'studyWithout'] as ('reprocess' | 'studyWithout')[])
            : (['recognize', 'studyWithout'] as ('recognize' | 'studyWithout')[]),
    };
  });

  return {
    materialId,
    title,
    kind,
    working,
    stages: summary.stages,
    ready: {
      units: groups.ready,
      sections: sections.filter((section) => section.state === 'ready').length,
    },
    problems: problems.filter((problem) => !groups.excluded.includes(problem.unit)),
    notExtracted,
    excluded: groups.excluded,
    coverage: {
      pages: units.map((unit) => ({ unit: unit.unitNo, word: words[unit.unitNo] ?? 'pending' })),
      summary: coverageSummary(units.map((unit) => words[unit.unitNo] ?? 'pending')),
      sections,
    },
    firstSection: sectionInfos[0]
      ? { blockId: sectionInfos[0].id, title: collapse(sectionInfos[0].current) }
      : null,
  };
}

// Los bloques que se pueden ofrecer para generar tarjetas (regla dura, CA-118): ni los de una
// página excluida, ni los de una página con un problema abierto, ni los que tienen un problema
// abierto o están marcados como imagen.
export function offerableBlocks(input: ReviewInput): string[] {
  const problems = problemsOf(input);
  const infos = infosOf(input.blocks);
  const excludedUnits = new Set(
    input.units.filter((unit) => unit.excluded === 1).map((unit) => unit.unitNo),
  );
  const openUnit = new Set(
    problems
      .filter((problem) => problem.blockId === null && isOpenProblem(problem.resolution))
      .map((problem) => problem.unit),
  );
  const imageUnit = new Set(
    problems
      .filter((problem) => problem.blockId === null && problem.resolution === 'image')
      .map((problem) => problem.unit),
  );
  // Una página que no está leída (sin texto, todavía leyéndose o con error) tampoco aporta bloques.
  const readUnits = new Set(
    input.units.filter((unit) => unit.status === 'ready').map((unit) => unit.unitNo),
  );
  return infos
    .filter((info) => OFFERABLE_TYPES.has(info.type) && readUnits.has(info.unit))
    .filter((info) => {
      const own = problems.find((problem) => problem.blockId === info.id);
      return isOfferableForCards({
        openProblem: (own ? isOpenProblem(own.resolution) : false) || openUnit.has(info.unit),
        excluded: excludedUnits.has(info.unit),
        markedAsImage: own?.resolution === 'image' || imageUnit.has(info.unit),
      });
    })
    .map((info) => info.id);
}
