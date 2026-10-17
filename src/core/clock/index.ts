// El reloj único de Retenia. Este es el único archivo que puede leer la hora del
// sistema; todo lo demás recibe un Clock (lo vigila la regla «reloj del sistema»).

export const BUENOS_AIRES_ZONE = 'America/Argentina/Buenos_Aires';

export interface Clock {
  now(): Date;
}

export function systemClock(): Clock {
  return { now: () => new Date() };
}

// Un cronómetro: cuánto tardó algo, en milisegundos. No da la hora, solo mide; por eso la
// variante de prueba lo usa de verdad aunque su reloj esté quieto en la fecha de demostración
// (el Laboratorio dice «Tardó 1,1 s»).
export interface Stopwatch {
  start(): () => number;
}

export function systemStopwatch(): Stopwatch {
  return {
    start() {
      const started = performance.now();
      return () => Math.max(0, performance.now() - started);
    },
  };
}

export function fixedStopwatch(elapsedMs: number): Stopwatch {
  return { start: () => () => elapsedMs };
}

export function fixedClock(instant: Date): Clock {
  const epochMs = instant.getTime();
  return { now: () => new Date(epochMs) };
}

// Lunes 15/03/2027 10:00, hora de Buenos Aires: la fecha fija del modo demostración.
const DEMO_INSTANT = '2027-03-15T10:00:00-03:00';
const DAY_MS = 86_400_000;

// «+1 día», «+7 días» y «+35 días» suman días enteros a la fecha fija (Buenos Aires no cambia
// de horario, así que un día son siempre 24 horas).
export function demoClock(offsetDays = 0): Clock {
  return fixedClock(new Date(new Date(DEMO_INSTANT).getTime() + offsetDays * DAY_MS));
}
