import type { Clock, Stopwatch } from '../core/clock';

// Los tiempos de una actividad de la Fase 16 («Practicar ahora» y la ayuda de la sesión), del lado
// del principal: la ventana no puede leer la hora. Cada apertura empieza a medir al abrirse; cada
// ayuda anota a los cuántos milisegundos se pidió, y el envío, cuándo se mostró, la primera
// interacción y cuándo se envió.

export interface ActivityTimer {
  open(openingId: string): void;
  // Milisegundos desde que se abrió (0 si no se conoce la apertura).
  elapsed(openingId: string): number;
  firstInput(openingId: string): void;
  // Los tiempos para guardar con el intento.
  submitted(openingId: string): {
    shownAt: string;
    firstInputMs: number | null;
    submittedMs: number | null;
  };
}

// Cuántas aperturas se recuerdan a la vez (las viejas se olvidan).
const MAX_OPEN = 200;

export function createActivityTimer(clock: Clock, stopwatch: Stopwatch): ActivityTimer {
  const openings = new Map<
    string,
    { shownAt: Date; since: () => number; firstInputMs: number | null }
  >();
  const elapsed = (openingId: string) => {
    const opening = openings.get(openingId);
    return opening ? Math.round(opening.since()) : 0;
  };
  return {
    open(openingId) {
      if (openings.has(openingId)) {
        return;
      }
      openings.set(openingId, {
        shownAt: clock.now(),
        since: stopwatch.start(),
        firstInputMs: null,
      });
      if (openings.size > MAX_OPEN) {
        const oldest = openings.keys().next().value;
        if (oldest !== undefined) {
          openings.delete(oldest);
        }
      }
    },
    elapsed,
    firstInput(openingId) {
      const opening = openings.get(openingId);
      if (opening && opening.firstInputMs === null) {
        opening.firstInputMs = elapsed(openingId);
      }
    },
    submitted(openingId) {
      const opening = openings.get(openingId);
      if (!opening) {
        return { shownAt: clock.now().toISOString(), firstInputMs: null, submittedMs: null };
      }
      return {
        shownAt: opening.shownAt.toISOString(),
        firstInputMs: opening.firstInputMs,
        submittedMs: elapsed(openingId),
      };
    },
  };
}
