import { describe, expect, it } from 'vitest';
import { demoClock, type Stopwatch } from '../../src/core/clock';
import { createStudyTimer } from '../../src/main/study-timer';

// El corte de inactividad de la Fase 11: un paso de la sesión cuenta como máximo lo que diga el
// tope que se le da al cronómetro (el menor entre 3 veces la estimación de un repaso y 120
// segundos); el tiempo medido de verdad se guarda aparte, como dato.
function scripted(values: number[]): Stopwatch {
  return {
    start() {
      return () => values.shift() ?? 0;
    },
  };
}

const SESSION = 's';

describe('cronómetro con corte de inactividad', () => {
  it('[CA-090] un repaso en el que estuve 5 minutos sin tocar nada cuenta como máximo 36 segundos', () => {
    const timer = createStudyTimer(demoClock(), scripted([5_000, 300_000, 2_000]), () => 36_000);
    timer.begin(SESSION);
    expect(timer.step(SESSION)).toBe(5_000);
    expect(timer.step(SESSION)).toBe(36_000);
    expect(timer.stop(SESSION)).toBe(2_000);
  });

  it('[CA-090] el tope sigue a la estimación vigente: con una estimación mayor el tope es mayor, hasta 120 segundos', () => {
    let cap = 36_000;
    const timer = createStudyTimer(demoClock(), scripted([200_000, 200_000]), () => cap);
    timer.begin(SESSION);
    expect(timer.step(SESSION)).toBe(36_000);
    cap = 120_000;
    expect(timer.step(SESSION)).toBe(120_000);
  });
});
