import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildInterleavedSet, type ProblemType } from '../../src/core/interleave';
import { type LadderEvent, projectLadder, resolveSteps, rungsOf } from '../../src/core/procedure';
import { evaluateFormula, generateVariant, type VariantFamily } from '../../src/core/variants';

// Invariantes de la Fase 18 con cientos de casos generados con semilla.

const SEED = 20270315;
const RUNS = { seed: SEED, numRuns: 300 };

const typesArbitrary = fc
  .array(fc.integer({ min: 1, max: 6 }), { minLength: 2, maxLength: 5 })
  .map((sizes): ProblemType[] =>
    sizes.map((size, type) => ({
      id: `t${type}`,
      name: `Tipo ${type}`,
      cardIds: Array.from({ length: size }, (_, n) => `c${type}-${n}`),
    })),
  );

describe('conjunto intercalado', () => {
  it('[CA-162] en cualquier conjunto generado no hay dos tipos iguales seguidos, ni problemas repetidos', () => {
    fc.assert(
      fc.property(typesArbitrary, fc.string(), (types, seed) => {
        const set = buildInterleavedSet(types, seed);
        for (let n = 1; n < set.length; n += 1) {
          expect(set[n]?.typeId).not.toBe(set[n - 1]?.typeId);
        }
        expect(new Set(set.map((item) => item.cardId)).size).toBe(set.length);
        for (const item of set) {
          expect(types.find((type) => type.id === item.typeId)?.cardIds).toContain(item.cardId);
        }
        // Entran todos los tipos, y de cada uno 3 como mucho.
        for (const type of types) {
          const count = set.filter((item) => item.typeId === type.id).length;
          expect(count).toBeGreaterThanOrEqual(1);
          expect(count).toBeLessThanOrEqual(3);
        }
      }),
      RUNS,
    );
  });
});

const familyArbitrary = fc.record({
  media: fc.uniqueArray(fc.integer({ min: -500, max: 500 }), { minLength: 1, maxLength: 5 }),
  n: fc.uniqueArray(fc.integer({ min: 1, max: 400 }), { minLength: 2, maxLength: 5 }),
  ee: fc.uniqueArray(
    fc.integer({ min: 1, max: 60 }).map((v) => v / 4),
    { minLength: 1, maxLength: 4 },
  ),
});

describe('variantes', () => {
  it('[CA-164] toda variante generada tiene respuestas que cumplen sus fórmulas', () => {
    fc.assert(
      fc.property(familyArbitrary, fc.string(), fc.nat(10_000), (values, seed, n) => {
        const family: VariantFamily = {
          statements: ['{media} {n} {s}'],
          parameters: [
            { name: 'media', values: values.media },
            { name: 'n', values: values.n },
            { name: 'ee', values: values.ee },
          ],
          derived: [{ name: 's', formula: 'ee * raiz(n)' }],
        };
        const variant = generateVariant(family, seed, n);
        const { media, n: size, ee, s } = variant.values as Record<string, number>;
        expect(values.media).toContain(media);
        expect(values.n).toContain(size);
        expect(values.ee).toContain(ee);
        expect(s).toBeCloseTo((ee as number) * Math.sqrt(size as number), 9);
        const steps = resolveSteps(
          {
            type: 'procedure',
            family,
            steps: [
              {
                id: 'a',
                prompt: 'a',
                expected: { type: 'number', formula: 's / raiz(n)', tolerance: 0, unit: null },
                explanation: 'x',
                key: true,
              },
              {
                id: 'b',
                prompt: 'b',
                expected: {
                  type: 'number',
                  formula: 'media + 1,96 * paso1',
                  tolerance: 0,
                  unit: null,
                },
                explanation: 'x',
                key: false,
              },
            ],
          },
          variant.values,
        );
        const first = steps[0]?.expected;
        const second = steps[1]?.expected;
        expect(first?.type === 'number' && first.value).toBeCloseTo(
          evaluateFormula('s / raiz(n)', variant.values),
          9,
        );
        expect(second?.type === 'number' && second.value).toBeCloseTo(
          (media as number) + 1.96 * (ee as number),
          9,
        );
      }),
      RUNS,
    );
  });
});

const ladderEvent = fc.record({
  dayOffset: fc.integer({ min: 0, max: 60 }),
  studied: fc.boolean(),
  failedStep: fc.option(fc.constantFrom('a', 'b'), { nil: null }),
  aided: fc.boolean(),
});

describe('escalera de apoyo', () => {
  it('[CA-159] el escalón nunca cambia más de uno por vez, ni más de una vez por día, y no se sale de la escalera', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.array(ladderEvent, { maxLength: 60 }),
        (stepCount, items) => {
          const rungs = rungsOf(stepCount).length;
          const events: LadderEvent[] = [...items]
            .sort((a, b) => a.dayOffset - b.dayOffset)
            .map((item, index) => {
              const base = {
                id: `e${String(index).padStart(3, '0')}`,
                seq: index + 1,
                studyDay: new Date(Date.UTC(2027, 2, 1 + item.dayOffset))
                  .toISOString()
                  .slice(0, 10),
              };
              return item.studied
                ? { ...base, kind: 'studied' as const }
                : {
                    ...base,
                    kind: 'attempt' as const,
                    failedStep: item.failedStep,
                    aided: item.aided,
                  };
            });
          const result = projectLadder(rungs, events);
          let level = 0;
          const changedDays: string[] = [];
          for (const [index, step] of result.steps.entries()) {
            expect(Math.abs(step.level - level)).toBeLessThanOrEqual(1);
            expect(step.level).toBeGreaterThanOrEqual(0);
            expect(step.level).toBeLessThan(rungs);
            if (step.level !== level) {
              expect(step.counted).toBe(true);
              changedDays.push(events[index]?.studyDay ?? '');
            }
            level = step.level;
          }
          expect(new Set(changedDays).size).toBe(changedDays.length);
          // El apoyo no se retira por aciertos del mismo día: retirar un escalón pide 2 días.
          const successDays = new Set(
            events
              .filter((e) => e.kind === 'studied' || (e.failedStep === null && !e.aided))
              .map((e) => e.studyDay),
          );
          expect(result.level).toBeLessThanOrEqual(Math.floor(successDays.size / 2));
        },
      ),
      RUNS,
    );
  });
});
