import { BUENOS_AIRES_ZONE } from '../clock';

// Un día de estudio va de las 04:00 a las 03:59:59 del día siguiente, hora de Buenos Aires:
// lo que hacés a la madrugada cuenta para el día anterior.
const STUDY_DAY_CUTOFF_HOUR = 4;

const localParts = new Intl.DateTimeFormat('en-US', {
  timeZone: BUENOS_AIRES_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((p) => p.type === type)?.value;
  if (value === undefined) {
    throw new Error(`Falta la parte «${type}» al leer la hora de Buenos Aires`);
  }
  return Number(value);
}

// Devuelve el día de estudio como fecha AAAA-MM-DD.
export function studyDayOf(instant: Date): string {
  const parts = localParts.formatToParts(instant);
  const year = part(parts, 'year');
  const month = part(parts, 'month');
  const day = part(parts, 'day');
  const hour = part(parts, 'hour');
  const shift = hour < STUDY_DAY_CUTOFF_HOUR ? -1 : 0;
  return new Date(Date.UTC(year, month - 1, day + shift)).toISOString().slice(0, 10);
}
