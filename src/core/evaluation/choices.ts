import type { Verdict } from '../memory';
import { shuffle } from './random';
import type { OptionItem } from './types';

// Opciones (CA-133) y ordenar pasos.

// Siempre mezcladas, con la semilla del intento.
export function shuffledOptions(ids: readonly string[], seed: string): string[] {
  return shuffle(ids, `opciones:${seed}`);
}

export function evaluateOptions(
  chosenId: string,
  options: readonly OptionItem[],
): { verdict: Verdict; explanation: string | null } {
  const chosen = options.find((option) => option.id === chosenId);
  if (chosen?.correct === true) {
    return { verdict: 'correct', explanation: null };
  }
  return { verdict: 'incorrect', explanation: chosen?.explanation ?? null };
}

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, n) => id === b[n]);

// El orden en que se muestran los pasos: mezclado, y nunca el correcto ni uno ya aceptado.
export function initialOrder(
  correct: readonly string[],
  seed: string,
  accepted: readonly (readonly string[])[] = [],
): string[] {
  const taken = (order: readonly string[]) =>
    same(order, correct) || accepted.some((other) => same(order, other));
  for (let turn = 0; turn < 50; turn += 1) {
    const mixed = shuffle(correct, `pasos:${seed}:${turn}`);
    for (let shift = 0; shift < mixed.length; shift += 1) {
      const rotated = [...mixed.slice(shift), ...mixed.slice(0, shift)];
      if (!taken(rotated)) {
        return rotated;
      }
    }
  }
  // Todos los órdenes posibles están aceptados: cualquiera vale.
  return [...correct].reverse();
}

// ¿Difieren en un solo par de pasos vecinos cambiados?
function oneAdjacentSwap(given: readonly string[], target: readonly string[]): boolean {
  const wrong = given.flatMap((id, n) => (id === target[n] ? [] : [n]));
  const [a, b] = wrong;
  return (
    wrong.length === 2 &&
    a !== undefined &&
    b === a + 1 &&
    given[a] === target[b] &&
    given[b] === target[a]
  );
}

export function evaluateOrder(
  given: readonly string[],
  correct: readonly string[],
  accepted: readonly (readonly string[])[],
): { verdict: Verdict; perStep: ('ok' | 'wrong')[] } {
  const targets = [correct, ...accepted];
  const marks = (target: readonly string[]) =>
    given.map((id, n): 'ok' | 'wrong' => (id === target[n] ? 'ok' : 'wrong'));
  const exact = targets.find((target) => same(given, target));
  if (exact !== undefined) {
    return { verdict: 'correct', perStep: marks(exact) };
  }
  const close = targets.find((target) => oneAdjacentSwap(given, target));
  if (close !== undefined) {
    return { verdict: 'partial', perStep: marks(close) };
  }
  return { verdict: 'incorrect', perStep: marks(correct) };
}
