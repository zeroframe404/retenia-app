import { describe, expect, it } from 'vitest';
import { demoClock, type Stopwatch } from '../../src/core/clock';
import { createStudyTimer, IDLE_CAP_MS } from '../../src/main/study-timer';

// Los tiempos de la sesión de estudio que mide el principal (Fase 10): cada medición del
// cronómetro de prueba da lo que diga la lista, en orden.
function scripted(values: number[]): Stopwatch {
  return {
    start() {
      return () => values.shift() ?? 0;
    },
  };
}

const SESSION = 's';

describe('cronómetro de la sesión', () => {
  it('[CA-074] los milisegundos activos de cada paso tienen un tope de 10 minutos por tramo quieto', () => {
    const timer = createStudyTimer(demoClock(), scripted([4000, IDLE_CAP_MS * 3, 2500]));
    timer.begin(SESSION);
    expect(timer.step(SESSION)).toBe(4000);
    expect(timer.step(SESSION)).toBe(IDLE_CAP_MS);
    expect(timer.stop(SESSION)).toBe(2500);
    // Después de pausar no se mide nada hasta retomar.
    expect(timer.stop(SESSION)).toBe(0);
    expect(timer.stopAny()).toBe(0);
  });

  it('[CA-069] guarda cuándo se mostró, la primera interacción y cuándo se pidió la respuesta, y se olvida al calificar', () => {
    const timer = createStudyTimer(demoClock(), scripted([1200, 8000, 9500]));
    timer.mark('a', 'shown');
    timer.mark('a', 'firstInteraction');
    timer.mark('a', 'answerRequested');
    expect(timer.take('a')).toEqual({
      shownAt: new Date('2027-03-15T13:00:00.000Z'),
      firstInteractionMs: 1200,
      answerRequestedMs: 8000,
      gradedMs: 9500,
    });
    expect(timer.take('a')).toEqual({
      shownAt: null,
      firstInteractionMs: null,
      answerRequestedMs: null,
      gradedMs: null,
    });
  });

  it('[CA-069] pedir la respuesta sin haber tocado nada antes cuenta como la primera interacción', () => {
    const timer = createStudyTimer(demoClock(), scripted([3000, 4000]));
    timer.mark('a', 'answerRequested');
    expect(timer.take('a')).toMatchObject({ firstInteractionMs: 3000, answerRequestedMs: 3000 });
  });

  it('[CA-068] otra sesión no hereda lo medido de la anterior', () => {
    const timer = createStudyTimer(demoClock(), scripted([5000]));
    timer.begin('vieja');
    expect(timer.step('nueva')).toBe(0);
    // Lo de «vieja» se descarta: la primera medición es ya la de «nueva».
    expect(timer.stopAny()).toBe(5000);
  });
});
