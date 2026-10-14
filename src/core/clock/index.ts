// El reloj único de Retenia. Este es el único archivo que puede leer la hora del
// sistema; todo lo demás recibe un Clock (lo vigila la regla «reloj del sistema»).

export const BUENOS_AIRES_ZONE = 'America/Argentina/Buenos_Aires';

export interface Clock {
  now(): Date;
}

export function systemClock(): Clock {
  return { now: () => new Date() };
}

export function fixedClock(instant: Date): Clock {
  const epochMs = instant.getTime();
  return { now: () => new Date(epochMs) };
}

// Lunes 15/03/2027 10:00, hora de Buenos Aires: la fecha fija del modo demostración.
const DEMO_INSTANT = '2027-03-15T10:00:00-03:00';

export function demoClock(): Clock {
  return fixedClock(new Date(DEMO_INSTANT));
}
