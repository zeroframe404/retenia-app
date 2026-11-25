import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  allowedVerdicts,
  canSetVerdict,
  evaluateNumeric,
  evaluateShort,
  initialOrder,
  normalizeShortAnswer,
  parseNumber,
  shuffledOptions,
} from '../../src/core/evaluation';

const SEED = 20270315;
const VERDICTS = ['incorrect', 'partial', 'correct'] as const;
const rank = (verdict: (typeof VERDICTS)[number]) => VERDICTS.indexOf(verdict);

describe('evaluación sin IA: propiedades', () => {
  it('[CA-132] escribir un número con coma o con punto da lo mismo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -99_999, max: 99_999 }),
        // Con tres cifras después de un punto se lee como miles (1.500 es mil quinientos).
        fc.integer({ min: 0, max: 9999 }).filter((decimals) => String(decimals).length !== 3),
        (whole, decimals) => {
          const fraction = String(decimals);
          const withComma = parseNumber(`${whole},${fraction}`);
          const withDot = parseNumber(`${whole}.${fraction}`);
          expect(withComma).not.toBeNull();
          expect(withComma).toEqual(withDot);
          const spec = { value: withDot?.value ?? 0, tolerance: 0, unit: null };
          expect(evaluateNumeric(`${whole},${fraction}`, spec, []).verdict).toBe('correct');
        },
      ),
      { seed: SEED },
    );
  });

  it('[CA-130] el resultado nunca puede quedar más alto que el propuesto', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VERDICTS),
        fc.constantFrom(...VERDICTS),
        (proposed, chosen) => {
          expect(canSetVerdict(proposed, chosen)).toBe(rank(chosen) <= rank(proposed));
          for (const allowed of allowedVerdicts(proposed)) {
            expect(rank(allowed)).toBeLessThanOrEqual(rank(proposed));
          }
        },
      ),
      { seed: SEED },
    );
  });

  it('[CA-131] normalizar dos veces da lo mismo, y una respuesta igual a la referencia es correcta', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', minLength: 1, maxLength: 60 }), (text) => {
        const once = normalizeShortAnswer(text);
        expect(normalizeShortAnswer(once)).toBe(once);
        if (once !== '') {
          expect(evaluateShort(text, [text]).verdict).toBe('correct');
          // Las mayúsculas no cuentan (salvo letras como la ß, que en mayúscula son otras dos).
          if (text.toUpperCase().toLowerCase() === text.toLowerCase()) {
            expect(evaluateShort(text.toUpperCase(), [text]).verdict).toBe('correct');
          }
        }
      }),
      { seed: SEED },
    );
  });

  it('[CA-133] mezclar opciones nunca pierde ni repite una', () => {
    fc.assert(
      fc.property(fc.string(), (seed) => {
        expect([...shuffledOptions(['a', 'b', 'c'], seed)].sort()).toEqual(['a', 'b', 'c']);
      }),
      { seed: SEED },
    );
  });

  it('el orden inicial de los pasos nunca es el correcto y no pierde pasos', () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 8 }), fc.string(), (count, seed) => {
        const steps = Array.from({ length: count }, (_, n) => `s${n}`);
        const initial = initialOrder(steps, seed);
        expect(initial).not.toEqual(steps);
        expect([...initial].sort()).toEqual([...steps].sort());
      }),
      { seed: SEED },
    );
  });
});
