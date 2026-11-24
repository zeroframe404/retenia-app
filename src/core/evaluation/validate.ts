import { normalizeShortAnswer } from './short';
import type { Activity } from './types';
import { MAX_UNITS, MIN_UNITS } from './verdicts';

// Lo que exige el editor de cada tipo en la ficha. Devuelve los problemas (vacío si está bien).

const OPTIONS_COUNT = 3;
const MIN_STEPS = 3;
const MAX_STEPS = 8;
const MAX_UNIT_LENGTH = 20;

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
  | 'unitsBlank';

const blank = (text: string) => text.trim() === '';

function repeated(texts: readonly string[]): boolean {
  const keys = texts.map(normalizeShortAnswer);
  return new Set(keys).size !== keys.length;
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
      break;
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
