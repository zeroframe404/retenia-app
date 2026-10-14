// Las herramientas de la red también leen la hora a través del reloj único de Retenia.
// Node carga ese archivo TypeScript directamente; si un día no pudiera, verify.mjs, el freno
// de cierre y el gancho de edición lo informan como falla en lugar de apagarse.
import { BUENOS_AIRES_ZONE, systemClock } from '../../src/core/clock/index.ts';

const clock = systemClock();

export function now() {
  return clock.now();
}

export function stopwatch() {
  const start = clock.now().getTime();
  return () => clock.now().getTime() - start;
}

const oneDecimal = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// 1234 → «1,2 s»; 75000 → «1 min 15 s».
/** @param {number} ms */
export function formatDuration(ms) {
  if (ms < 60_000) {
    return `${oneDecimal.format(ms / 1000)} s`;
  }
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
}

const dateTimeParts = new Intl.DateTimeFormat('en-US', {
  timeZone: BUENOS_AIRES_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Fecha y hora de Buenos Aires: «13/10/2026 20:15».
/** @param {Date} date */
export function formatDateTime(date) {
  const p = Object.fromEntries(dateTimeParts.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
