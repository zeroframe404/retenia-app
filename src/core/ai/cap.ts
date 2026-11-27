import { localDateTime } from '../study-day';

// El tope de gasto del mes (Fase 19, CA-169): aviso al 80 %, freno al 100 %. El mes es el del
// calendario de Buenos Aires (que no cambia de horario: siempre tres horas menos que UTC). El freno
// mira además lo máximo que puede costar la consulta que pedís: si con ella se podría pasar el
// tope, no se manda. Así el mes nunca pasa el tope.

export const DEFAULT_CAP_CENTS = 1000;

const MICROS_PER_CENT = 10_000;
const WARNING_PERCENT = 80;

export type CapState = 'ok' | 'warning' | 'reached';

const capMicros = (capCents: number) => capCents * MICROS_PER_CENT;

// «2027-03» para un instante.
export function monthOf(instant: Date): string {
  return localDateTime(instant).day.slice(0, 7);
}

// Desde y hasta (sin incluirlo) en instantes UTC, para buscar los envíos de un mes.
export function monthBounds(month: string): { from: string; to: string } {
  const [year, number] = month.split('-').map(Number);
  if (year === undefined || number === undefined || !Number.isInteger(year + number)) {
    throw new Error(`Mes inválido: «${month}»`);
  }
  const start = (y: number, m: number) =>
    new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00-03:00`).toISOString();
  return {
    from: start(year, number),
    to: number === 12 ? start(year + 1, 1) : start(year, number + 1),
  };
}

export function percentUsed(spentMicros: number, capCents: number): number {
  return Math.floor((spentMicros * 100) / capMicros(capCents));
}

export function capState(spentMicros: number, capCents: number): CapState {
  if (spentMicros >= capMicros(capCents)) {
    return 'reached';
  }
  return percentUsed(spentMicros, capCents) >= WARNING_PERCENT ? 'warning' : 'ok';
}

// Si la consulta siguiente entra: el tope no se alcanzó y, aunque cueste lo máximo, no lo pasa.
export function fitsUnderCap(
  spentMicros: number,
  capCents: number,
  nextMaxMicros: number,
): boolean {
  const cap = capMicros(capCents);
  return spentMicros < cap && spentMicros + nextMaxMicros <= cap;
}
