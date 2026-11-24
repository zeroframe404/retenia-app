import type { Verdict } from '../memory';

// Respuesta abierta (CA-129) y el cambio del resultado propuesto (CA-130).

export const MIN_UNITS = 2;
export const MAX_UNITS = 4;

class UnitsOutOfRangeError extends Error {
  constructor(marked: number, total: number) {
    super(`No se puede marcar ${marked} de ${total} unidades de idea`);
    this.name = 'UnitsOutOfRangeError';
  }
}

// Todas → «Correcto.»; falta una → «Vas bien.»; el resto → «Todavía no.».
export function verdictFromUnits(marked: number, total: number): Verdict {
  if (
    !Number.isInteger(marked) ||
    !Number.isInteger(total) ||
    total < MIN_UNITS ||
    total > MAX_UNITS ||
    marked < 0 ||
    marked > total
  ) {
    throw new UnitsOutOfRangeError(marked, total);
  }
  if (marked === total) {
    return 'correct';
  }
  return marked === total - 1 ? 'partial' : 'incorrect';
}

// De más alto a más bajo.
const ORDER: readonly Verdict[] = ['correct', 'partial', 'incorrect'];

// Lo que se puede elegir partiendo de lo que propuso Retenia: lo mismo o más bajo, nunca más alto.
export function allowedVerdicts(proposed: Verdict): Verdict[] {
  return ORDER.slice(ORDER.indexOf(proposed));
}

export function canSetVerdict(proposed: Verdict, chosen: Verdict): boolean {
  return allowedVerdicts(proposed).includes(chosen);
}
