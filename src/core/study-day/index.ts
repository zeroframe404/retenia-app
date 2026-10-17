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

const minuteParts = new Intl.DateTimeFormat('en-US', {
  timeZone: BUENOS_AIRES_ZONE,
  minute: '2-digit',
});

// Devuelve el día de estudio como fecha AAAA-MM-DD.
export function studyDayOf(instant: Date): string {
  const parts = Object.fromEntries(localParts.formatToParts(instant).map((p) => [p.type, p.value]));
  const shift = Number(parts.hour) < STUDY_DAY_CUTOFF_HOUR ? -1 : 0;
  const day = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + shift);
  return new Date(day).toISOString().slice(0, 10);
}

// La fecha y la hora que dice el calendario en Buenos Aires, sin el corte de las 04:00: para
// lo que no es estudio (cuándo se hizo una copia, cuándo se hizo un cambio).
export function localDateTime(instant: Date): { day: string; time: string } {
  const parts = Object.fromEntries(localParts.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${minuteParts.format(instant).padStart(2, '0')}`,
  };
}
