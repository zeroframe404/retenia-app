import { MAX_TYPES, MIN_TYPES } from '../interleave';
import { type ProcedureProblem, validateProcedure } from '../procedure/steps';
import { generateVariant, validateFamily, variantCount } from '../variants/family';
import { evaluateFormula } from '../variants/formula';
import { normalizeShortAnswer } from './short';
import type { Activity } from './types';
import { MAX_UNITS, MIN_UNITS } from './verdicts';

// Lo que exige el editor de cada tipo en la ficha. Devuelve los problemas (vacío si está bien).

const OPTIONS_COUNT = 3;
const MIN_STEPS = 3;
const MAX_STEPS = 8;
const MAX_UNIT_LENGTH = 20;
const MIN_METHODS = 2;
const MAX_METHODS = 5;

type ActivityProblem =
  | 'value'
  | 'tolerance'
  | 'unit'
  | 'optionsCount'
  | 'optionsCorrect'
  | 'optionsBlank'
  | 'optionsRepeated'
  | 'optionsExplanation'
  | 'stepsCount'
  | 'stepsBlank'
  | 'stepsRepeated'
  | 'unitsCount'
  | 'unitsBlank'
  | 'family'
  | 'typesCount'
  | 'typesBlank'
  | 'typesRepeated'
  | 'typesEmpty'
  | ProcedureProblem;

const blank = (text: string) => text.trim() === '';

function repeated(texts: readonly string[]): boolean {
  const keys = texts.map(normalizeShortAnswer);
  return new Set(keys).size !== keys.length;
}

// La familia de un numérico: que valga y que la fórmula de la respuesta dé un número.
function badFamily(activity: Extract<Activity, { type: 'numeric' }>): boolean {
  const { family, formula } = activity;
  if (family === null || family === undefined) {
    return false;
  }
  if (formula === null || formula === undefined || validateFamily(family).length > 0) {
    return true;
  }
  try {
    for (let n = 0; n < variantCount(family); n += 1) {
      evaluateFormula(formula, generateVariant(family, 'check', n).values);
    }
    return false;
  } catch {
    return true;
  }
}

export function validateActivity(activity: Activity): ActivityProblem[] {
  const problems: ActivityProblem[] = [];
  switch (activity.type) {
    case 'short':
      break;
    case 'numeric':
      if (!Number.isFinite(activity.value)) {
        problems.push('value');
      }
      if (!Number.isFinite(activity.tolerance) || activity.tolerance < 0) {
        problems.push('tolerance');
      }
      if (
        activity.unit !== null &&
        (blank(activity.unit) || activity.unit.length > MAX_UNIT_LENGTH)
      ) {
        problems.push('unit');
      }
      if (badFamily(activity)) {
        problems.push('family');
      }
      break;
    case 'procedure':
      problems.push(...validateProcedure(activity));
      break;
    case 'decision': {
      const { options } = activity;
      if (options.length < MIN_METHODS || options.length > MAX_METHODS) {
        problems.push('optionsCount');
      }
      if (options.filter((option) => option.correct).length !== 1) {
        problems.push('optionsCorrect');
      }
      if (options.some((option) => blank(option.text))) {
        problems.push('optionsBlank');
      } else if (repeated(options.map((option) => option.text))) {
        problems.push('optionsRepeated');
      }
      if (options.some((option) => blank(option.explanation))) {
        problems.push('optionsExplanation');
      }
      break;
    }
    case 'interleaved': {
      const { types } = activity;
      if (types.length < MIN_TYPES || types.length > MAX_TYPES) {
        problems.push('typesCount');
      }
      if (types.some((type) => blank(type.name))) {
        problems.push('typesBlank');
      } else if (repeated(types.map((type) => type.name))) {
        problems.push('typesRepeated');
      }
      const cardIds = types.flatMap((type) => type.cardIds);
      if (
        types.some((type) => type.cardIds.length === 0) ||
        new Set(cardIds).size !== cardIds.length
      ) {
        problems.push('typesEmpty');
      }
      break;
    }
    case 'options': {
      const { options } = activity;
      if (options.length !== OPTIONS_COUNT) {
        problems.push('optionsCount');
      }
      if (options.filter((option) => option.correct).length !== 1) {
        problems.push('optionsCorrect');
      }
      if (options.some((option) => blank(option.text))) {
        problems.push('optionsBlank');
      } else if (repeated(options.map((option) => option.text))) {
        problems.push('optionsRepeated');
      }
      if (options.some((option) => !option.correct && blank(option.explanation))) {
        problems.push('optionsExplanation');
      }
      break;
    }
    case 'order': {
      const { steps } = activity;
      if (steps.length < MIN_STEPS || steps.length > MAX_STEPS) {
        problems.push('stepsCount');
      }
      if (steps.some((step) => blank(step.text))) {
        problems.push('stepsBlank');
      } else if (repeated(steps.map((step) => step.text))) {
        problems.push('stepsRepeated');
      }
      break;
    }
    case 'open': {
      const { units } = activity;
      if (units.length < MIN_UNITS || units.length > MAX_UNITS) {
        problems.push('unitsCount');
      }
      if (units.some((unit) => blank(unit.text))) {
        problems.push('unitsBlank');
      }
      break;
    }
  }
  return problems;
}
