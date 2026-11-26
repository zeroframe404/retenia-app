import { evaluateNumeric } from '../evaluation/numeric';
import type { HelpLevel, Verdict } from '../memory';
import {
  evaluateFormula,
  generateVariant,
  placeholdersOf,
  renderTemplate,
  type VariantFamily,
  type VariantValues,
  validateFamily,
  variantCount,
} from '../variants';
import type { Rung } from './ladder';

// Un procedimiento (Fase 18, H-37): una lista ordenada de pasos, cada uno con su enunciado, su
// resultado esperado (texto, o número con margen), su explicación y la marca de «paso clave». El
// número esperado se escribe como cuenta: con los datos de la variante y los pasos de antes
// («paso1», «paso2»…).

type StepExpected =
  | {
      readonly type: 'number';
      readonly formula: string;
      readonly tolerance: number;
      readonly unit: string | null;
    }
  | { readonly type: 'text'; readonly text: string };

interface ProcedureStep {
  readonly id: string;
  readonly prompt: string;
  readonly expected: StepExpected;
  readonly explanation: string;
  readonly key: boolean;
}

export interface Procedure {
  readonly type: 'procedure';
  readonly steps: readonly ProcedureStep[];
  readonly family: VariantFamily | null;
}

export interface ResolvedStep {
  readonly id: string;
  // El número del paso, desde 1.
  readonly position: number;
  readonly prompt: string;
  readonly explanation: string;
  readonly key: boolean;
  readonly expected:
    | {
        readonly type: 'number';
        readonly value: number;
        readonly tolerance: number;
        readonly unit: string | null;
      }
    | { readonly type: 'text'; readonly text: string };
}

// Los pasos con los números de una variante: cada resultado se calcula.
export function resolveSteps(procedure: Procedure, values: VariantValues): ResolvedStep[] {
  const known: Record<string, number> = { ...values };
  return procedure.steps.map((step, index) => {
    const base = {
      id: step.id,
      position: index + 1,
      prompt: renderTemplate(step.prompt, values),
      explanation: renderTemplate(step.explanation, values),
      key: step.key,
    };
    if (step.expected.type === 'text') {
      return {
        ...base,
        expected: { type: 'text' as const, text: renderTemplate(step.expected.text, values) },
      };
    }
    const value = evaluateFormula(step.expected.formula, known);
    known[`paso${index + 1}`] = value;
    return {
      ...base,
      expected: {
        type: 'number' as const,
        value,
        tolerance: step.expected.tolerance,
        unit: step.expected.unit,
      },
    };
  });
}

// «ok» o «wrong» en un paso numérico; en uno de texto lo compara quien estudia con el paso modelo
// («self»), salvo que no haya escrito nada.
export type StepCheck = 'ok' | 'wrong' | 'self';

export function checkStep(step: ResolvedStep, written: string): StepCheck {
  if (step.expected.type === 'text') {
    return written.trim() === '' ? 'wrong' : 'self';
  }
  return evaluateNumeric(written, step.expected, []).verdict === 'correct' ? 'ok' : 'wrong';
}

// Cómo quedó cada paso vacío: bien de entrada, corregido al reintentarlo o mal.
export type StepState = 'ok' | 'fixed' | 'wrong';

// El primer paso (desde 0) que no salió bien de entrada: el que se nombra y el «tipo» del fallo.
export function failedStepOf(states: readonly StepState[]): number | null {
  const at = states.findIndex((state) => state !== 'ok');
  return at === -1 ? null : at;
}

export function procedureVerdict(states: readonly StepState[]): Verdict {
  if (states.includes('wrong')) {
    return 'incorrect';
  }
  return states.includes('fixed') ? 'partial' : 'correct';
}

// Con los primeros pasos resueltos a la vista es un ejemplo (A3); el problema entero y la variante
// se resuelven sin ayuda.
export function procedureHelpLevel(rung: Rung): HelpLevel {
  if (rung.kind === 'example') {
    return 'A4';
  }
  return rung.kind === 'blanks' ? 'A3' : 'A0';
}

export type ProcedureProblem =
  | 'stepCount'
  | 'emptyStep'
  | 'keyStep'
  | 'tolerance'
  | 'repeatedId'
  | 'family'
  | 'formula'
  | 'unknownName';

const MIN_STEPS = 2;
const MAX_STEPS = 8;
const blank = (text: string) => text.trim() === '';

export function validateProcedure(procedure: Procedure): ProcedureProblem[] {
  const problems = new Set<ProcedureProblem>();
  const { steps, family } = procedure;
  if (steps.length < MIN_STEPS || steps.length > MAX_STEPS) {
    problems.add('stepCount');
  }
  if (new Set(steps.map((step) => step.id)).size !== steps.length) {
    problems.add('repeatedId');
  }
  for (const step of steps) {
    const expected = step.expected.type === 'text' ? step.expected.text : step.expected.formula;
    if (blank(step.prompt) || blank(step.explanation) || blank(expected)) {
      problems.add('emptyStep');
    }
    if (
      step.expected.type === 'number' &&
      !(Number.isFinite(step.expected.tolerance) && step.expected.tolerance >= 0)
    ) {
      problems.add('tolerance');
    }
  }
  if (!steps.some((step) => step.key)) {
    problems.add('keyStep');
  }
  if (family !== null && validateFamily(family).length > 0) {
    problems.add('family');
    return [...problems];
  }
  // Un «{dato}» que la familia no tiene se vería tal cual en pantalla.
  const known = new Set(
    family === null ? [] : [...family.parameters, ...family.derived].map((item) => item.name),
  );
  const shown = steps.flatMap((step) => [
    step.prompt,
    step.explanation,
    step.expected.type === 'text' ? step.expected.text : '',
  ]);
  if (shown.some((template) => placeholdersOf(template).some((name) => !known.has(name)))) {
    problems.add('unknownName');
  }
  try {
    // Con todas las variantes: ninguna puede fallar al practicar.
    const count = family === null ? 1 : variantCount(family);
    for (let n = 0; n < count; n += 1) {
      resolveSteps(procedure, family === null ? {} : generateVariant(family, 'check', n).values);
    }
  } catch {
    problems.add('formula');
  }
  return [...problems];
}
