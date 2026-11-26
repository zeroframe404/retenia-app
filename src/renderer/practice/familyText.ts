import type { VariantFamilyValue } from '../../preload/contract/activities';
import { readEditorNumber } from './numbers';

// La familia de variantes como se escribe en la ficha (Fase 18): los enunciados uno por renglón, los
// datos como «nombre = 10; 20; 30» y las cuentas como «nombre = cuenta».

export interface FamilyDraft {
  statements: string;
  parameters: string;
  derived: string;
}

const EMPTY_FAMILY: FamilyDraft = { statements: '', parameters: '', derived: '' };

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

const decimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 6, useGrouping: false });

export function familyDraftOf(family: VariantFamilyValue | null | undefined): FamilyDraft {
  return family
    ? {
        statements: family.statements.join('\n'),
        parameters: family.parameters
          .map((item) => `${item.name} = ${item.values.map((v) => decimal.format(v)).join('; ')}`)
          .join('\n'),
        derived: family.derived.map((item) => `${item.name} = ${item.formula}`).join('\n'),
      }
    : { ...EMPTY_FAMILY };
}

function assignment(line: string): [string, string] | null {
  const at = line.indexOf('=');
  const name = line.slice(0, at).trim();
  const rest = line.slice(at + 1).trim();
  return at > 0 && name !== '' && rest !== '' ? [name, rest] : null;
}

export function familyOf(
  draft: FamilyDraft,
): { family: VariantFamilyValue } | { problem: 'family' | 'parameters' | 'derived' } {
  const statements = lines(draft.statements);
  const parameters: VariantFamilyValue['parameters'] = [];
  for (const line of lines(draft.parameters)) {
    const parsed = assignment(line);
    const values = parsed?.[1].split(';').map((value) => readEditorNumber(value.trim())) ?? [];
    if (!parsed || values.some((value) => value === null)) {
      return { problem: 'parameters' };
    }
    parameters.push({ name: parsed[0], values: values as number[] });
  }
  const derived: VariantFamilyValue['derived'] = [];
  for (const line of lines(draft.derived)) {
    const parsed = assignment(line);
    if (!parsed) {
      return { problem: 'derived' };
    }
    derived.push({ name: parsed[0], formula: parsed[1] });
  }
  if (statements.length === 0 || parameters.length === 0) {
    return { problem: 'family' };
  }
  return { family: { statements, parameters, derived } };
}
