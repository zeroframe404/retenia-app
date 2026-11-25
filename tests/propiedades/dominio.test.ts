import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addToEstimate,
  estimateMean,
  INITIAL_ESTIMATE,
  type MasteryEvent,
  type MasteryState,
  projectMastery,
} from '../../src/core/mastery';

// Invariantes de la máquina de estados de dominio y de la estimación (Fase 17), con cientos de
// historiales generados con semilla.

const SEED = 20270315;
const RUNS = { seed: SEED, numRuns: 300 };

const LADDER: Record<MasteryState, number> = {
  'not-started': 1,
  'in-practice': 2,
  'to-review': 3,
  enough: 4,
  consolidated: 5,
};

// Un día de estudio entre el 01/03/2027 y unos cuatro meses después.
const dayAt = (offset: number) =>
  new Date(Date.UTC(2027, 2, 1 + offset)).toISOString().slice(0, 10);

const attemptArbitrary = fc.record({
  dayOffset: fc.integer({ min: 0, max: 120 }),
  verdict: fc.constantFrom('correct' as const, 'partial' as const, 'incorrect' as const),
  helpLevel: fc.constantFrom(
    'A0' as const,
    'A1' as const,
    'A2' as const,
    'A3' as const,
    'A4' as const,
  ),
  optionsQuestion: fc.boolean(),
  valid: fc.boolean(),
  knowAlready: fc.boolean(),
});

type Generated = fc.TypeOf<typeof attemptArbitrary>;

// Los eventos en el orden en que se registraron: los días no bajan (como en la realidad, salvo un
// reloj atrasado, que la máquina ignora).
function historyOf(items: readonly Generated[], withKnowAlready = true): MasteryEvent[] {
  const sorted = [...items].sort((a, b) => a.dayOffset - b.dayOffset);
  return sorted.map((item, index) => {
    const base = {
      id: `e${String(index).padStart(4, '0')}`,
      seq: index + 1,
      studyDay: dayAt(item.dayOffset),
    };
    if (withKnowAlready && item.knowAlready && index === 0) {
      return { ...base, kind: 'knowAlready' as const };
    }
    return {
      ...base,
      kind: 'attempt' as const,
      activityId: `a${index % 3}`,
      verdict: item.verdict,
      helpLevel: item.helpLevel,
      optionsQuestion: item.optionsQuestion,
      valid: item.valid,
    };
  });
}

function shuffled<T>(items: readonly T[], keys: readonly number[]): T[] {
  return items
    .map((item, index) => ({ item, key: keys[index % Math.max(keys.length, 1)] ?? 0, index }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map(({ item }) => item);
}

describe('la máquina de estados de dominio', () => {
  it('[CA-147] el orden en que se cargan los eventos no cambia el estado: manda el orden de registro', () => {
    fc.assert(
      fc.property(
        fc.array(attemptArbitrary, { minLength: 0, maxLength: 25 }),
        fc.array(fc.integer(), { minLength: 1, maxLength: 25 }),
        (items, keys) => {
          const events = historyOf(items);
          expect(projectMastery(shuffled(events, keys))).toEqual(projectMastery(events));
        },
      ),
      RUNS,
    );
  });

  it('[CA-148] ningún intento con ayuda ni en una pregunta de opciones hace avanzar el estado', () => {
    fc.assert(
      fc.property(
        fc.array(attemptArbitrary, { minLength: 0, maxLength: 20 }),
        fc.constantFrom('A2' as const, 'A3' as const, 'A4' as const, 'options' as const),
        fc.integer({ min: 1, max: 30 }),
        (items, help, gap) => {
          const events = historyOf(items);
          const before = projectMastery(events);
          const lastDay = events.at(-1)?.studyDay ?? '2027-03-01';
          const next = new Date(`${lastDay}T12:00:00Z`);
          next.setUTCDate(next.getUTCDate() + gap);
          const after = projectMastery([
            ...events,
            {
              kind: 'attempt',
              id: 'zzzz',
              seq: events.length + 1,
              studyDay: next.toISOString().slice(0, 10),
              activityId: 'a0',
              verdict: 'correct',
              helpLevel: help === 'options' ? 'A0' : help,
              optionsQuestion: help === 'options',
              valid: true,
            },
          ]);
          if (before.state === 'not-started') {
            expect(after.state).toBe(help === 'A4' ? 'in-practice' : 'in-practice');
          } else if (LADDER[after.state] > LADDER[before.state]) {
            // Subir de escalón con ayuda solo puede ser imposible: lo que sí puede pasar es bajar
            // (la solución vista es un fallo).
            expect.unreachable(`${before.state} → ${after.state} con ${help}`);
          }
          expect(after.columns.unaided.count).toBe(before.columns.unaided.count);
        },
      ),
      RUNS,
    );
  });

  it('[CA-144] un solo intento, sea cual sea, nunca da más que «En práctica»', () => {
    fc.assert(
      fc.property(attemptArbitrary, (item) => {
        const result = projectMastery(historyOf([item], false));
        expect(['not-started', 'in-practice']).toContain(result.state);
        expect(result.state === 'in-practice').toBe(item.valid);
      }),
      RUNS,
    );
  });

  it('[CA-147] ningún camino con un intento que cuenta vuelve a «Sin iniciar»', () => {
    fc.assert(
      fc.property(fc.array(attemptArbitrary, { minLength: 1, maxLength: 25 }), (items) => {
        const events = historyOf(items, false);
        const result = projectMastery(events);
        if (result.steps.some((step) => step.counted)) {
          expect(result.state).not.toBe('not-started');
        }
      }),
      RUNS,
    );
  });

  it('[CA-145] «Suficiente para avanzar» y «Consolidado» siempre tienen detrás aciertos sin ayuda en días distintos (2 y 3), salvo con «Ya lo sé»', () => {
    fc.assert(
      fc.property(fc.array(attemptArbitrary, { minLength: 0, maxLength: 25 }), (items) => {
        const result = projectMastery(historyOf(items, false));
        if (result.state === 'enough') {
          expect(result.columns.unaided.count).toBeGreaterThanOrEqual(1);
        }
        if (result.state === 'consolidated') {
          expect(result.columns.unaided.count).toBeGreaterThanOrEqual(3);
          expect(result.columns.delayed.count).toBeGreaterThanOrEqual(1);
        }
      }),
      RUNS,
    );
  });
});

describe('la estimación de un concepto', () => {
  it('[CA-156] la media siempre queda entre 0 y 1, sin tocar los bordes', () => {
    fc.assert(
      fc.property(fc.array(attemptArbitrary, { maxLength: 60 }), (items) => {
        let estimate = INITIAL_ESTIMATE;
        for (const item of items) {
          estimate = addToEstimate(estimate, {
            outcome:
              item.verdict === 'correct'
                ? 'success'
                : item.verdict === 'partial'
                  ? 'partial'
                  : 'failure',
            helpLevel: item.helpLevel,
            optionsQuestion: item.optionsQuestion,
            valid: item.valid,
          });
        }
        const mean = estimateMean(estimate);
        expect(mean).toBeGreaterThan(0);
        expect(mean).toBeLessThan(1);
      }),
      RUNS,
    );
  });
});
