// Las herramientas de la red también leen la hora a través del reloj único de Retenia.
import { BUENOS_AIRES_ZONE, systemClock } from '../../src/core/clock/index.ts';

const clock = systemClock();

export function ahora() {
  return clock.now();
}

export function cronometro() {
  const inicio = clock.now().getTime();
  return () => clock.now().getTime() - inicio;
}

const coma = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// 1234 → «1,2 s»; 75000 → «1 min 15 s».
export function formatearDuracion(ms) {
  if (ms < 60_000) {
    return `${coma.format(ms / 1000)} s`;
  }
  const segundos = Math.round(ms / 1000);
  return `${Math.floor(segundos / 60)} min ${String(segundos % 60).padStart(2, '0')} s`;
}

const partes = new Intl.DateTimeFormat('en-US', {
  timeZone: BUENOS_AIRES_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

// Fecha y hora de Buenos Aires: «13/10/2026 20:15».
export function formatearFechaHora(fecha) {
  const p = Object.fromEntries(partes.formatToParts(fecha).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
