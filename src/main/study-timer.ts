import type { Clock, Stopwatch } from '../core/clock';
import type { AttemptMarks } from '../data/study';

// Los tiempos de la sesión de estudio (Fase 10), del lado del principal: la ventana no puede leer
// la hora, así que avisa cuándo mostró una tarjeta, la primera interacción y cuándo pidió la
// respuesta, y acá se miden con el cronómetro (que anda aunque la fecha de la demostración esté
// quieta). También los milisegundos activos de cada paso: lo que pasó desde el paso anterior, con
// un tope por si la ventana quedó abierta sin que nadie la use.

export const IDLE_CAP_MS = 10 * 60_000;

export type StudyMark = 'shown' | 'firstInteraction' | 'answerRequested';

export interface StudyTimer {
  // Empieza (o retoma) a medir una sesión.
  begin(sessionId: string): void;
  // Lo activo desde el paso anterior de esa sesión (como mucho el tope); vuelve a medir desde acá.
  step(sessionId: string): number;
  // Deja de medir (al pausar o terminar) y devuelve lo que quedaba.
  stop(sessionId: string): number;
  // Lo que quedaba de la sesión que se estaba midiendo, sea cual sea (al cerrar la ventana).
  stopAny(): number;
  mark(activityId: string, mark: StudyMark): void;
  // Los tiempos de la actividad al calificarla (y se olvidan).
  take(activityId: string): AttemptMarks;
}

export function createStudyTimer(clock: Clock, stopwatch: Stopwatch): StudyTimer {
  let running: { sessionId: string; elapsed: () => number } | null = null;
  const marks = new Map<
    string,
    {
      shownAt: Date;
      since: () => number;
      firstInteractionMs: number | null;
      answerRequestedMs: number | null;
    }
  >();
  const capped = (ms: number) => Math.min(IDLE_CAP_MS, Math.round(ms));

  const take = (sessionId: string, restart: boolean): number => {
    if (running?.sessionId !== sessionId) {
      if (restart) {
        running = { sessionId, elapsed: stopwatch.start() };
      }
      return 0;
    }
    const ms = capped(running.elapsed());
    running = restart ? { sessionId, elapsed: stopwatch.start() } : null;
    return ms;
  };

  return {
    begin(sessionId) {
      running = { sessionId, elapsed: stopwatch.start() };
    },
    step: (sessionId) => take(sessionId, true),
    stop: (sessionId) => take(sessionId, false),
    stopAny() {
      return running ? take(running.sessionId, false) : 0;
    },
    mark(activityId, mark) {
      const current = marks.get(activityId);
      if (mark === 'shown' || !current) {
        marks.set(activityId, {
          shownAt: clock.now(),
          since: stopwatch.start(),
          firstInteractionMs: null,
          answerRequestedMs: null,
        });
        if (mark === 'shown') {
          return;
        }
      }
      const entry = marks.get(activityId);
      if (!entry) {
        return;
      }
      const ms = Math.round(entry.since());
      if (mark === 'firstInteraction' && entry.firstInteractionMs === null) {
        entry.firstInteractionMs = ms;
      } else if (mark === 'answerRequested' && entry.answerRequestedMs === null) {
        entry.answerRequestedMs = ms;
        entry.firstInteractionMs ??= ms;
      }
    },
    take(activityId) {
      const entry = marks.get(activityId);
      marks.delete(activityId);
      if (!entry) {
        return { shownAt: null, firstInteractionMs: null, answerRequestedMs: null, gradedMs: null };
      }
      return {
        shownAt: entry.shownAt,
        firstInteractionMs: entry.firstInteractionMs,
        answerRequestedMs: entry.answerRequestedMs,
        gradedMs: Math.round(entry.since()),
      };
    },
  };
}
