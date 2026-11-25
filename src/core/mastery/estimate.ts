import type { HelpLevel } from '../memory';
import type { Outcome } from './types';

// La estimación interna de un concepto, por nivel (CA-156; decisiones-conciliadas.md, sección 4):
// dos contadores, a favor y en contra, que empiezan en 1 y 1. Cada intento suma su peso a uno de
// los dos: 1 sin ayuda (también con la pregunta orientadora), 0,3 con pista de concepto o de paso o
// en una pregunta de opciones, 0 con la solución vista o si quedó sin evaluar. Un «Vas bien.» suma
// la mitad a cada lado. La media es a favor ÷ (a favor + en contra).
//
// Sirve para ordenar prioridades y se muestra siempre con su respaldo («unos 7 de cada 10, con 4
// observaciones»); el estado de un objetivo lo deciden las reglas, no esta estimación.
//
// Se cuenta en centésimos (enteros), así 2 + 0,3 da exactamente 2,3.

const HUNDRED = 100;
const AIDED_WEIGHT = 30;

export interface Estimate {
  // En centésimos.
  readonly inFavor: number;
  readonly against: number;
  // Cuántos intentos sumaron algo (con peso mayor que cero).
  readonly observations: number;
}

export const INITIAL_ESTIMATE: Estimate = Object.freeze({
  inFavor: HUNDRED,
  against: HUNDRED,
  observations: 0,
});

export interface EstimateAttempt {
  readonly outcome: Outcome;
  readonly helpLevel: HelpLevel;
  readonly optionsQuestion: boolean;
  readonly valid: boolean;
}

// El peso de un intento, en centésimos.
export function weightOf(attempt: Omit<EstimateAttempt, 'outcome'>): number {
  if (!attempt.valid || attempt.helpLevel === 'A4') {
    return 0;
  }
  if (attempt.optionsQuestion || attempt.helpLevel === 'A2' || attempt.helpLevel === 'A3') {
    return AIDED_WEIGHT;
  }
  return HUNDRED;
}

export function addToEstimate(estimate: Estimate, attempt: EstimateAttempt): Estimate {
  const weight = weightOf(attempt);
  if (weight === 0) {
    return estimate;
  }
  const favor =
    attempt.outcome === 'success' ? weight : attempt.outcome === 'partial' ? weight / 2 : 0;
  return {
    inFavor: estimate.inFavor + favor,
    against: estimate.against + weight - favor,
    observations: estimate.observations + 1,
  };
}

export function estimateCounts(estimate: Estimate): { inFavor: number; against: number } {
  return { inFavor: estimate.inFavor / HUNDRED, against: estimate.against / HUNDRED };
}

export function estimateMean(estimate: Estimate): number {
  return estimate.inFavor / (estimate.inFavor + estimate.against);
}

// «unos N de cada 10, con M observaciones»; sin observaciones no se muestra un número.
export function estimateBacking(estimate: Estimate): {
  outOfTen: number | null;
  observations: number;
} {
  return {
    outOfTen: estimate.observations === 0 ? null : Math.round(estimateMean(estimate) * 10),
    observations: estimate.observations,
  };
}
