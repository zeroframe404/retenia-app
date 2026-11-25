import { describe, expect, it } from 'vitest';
import { type HelpUse, resultParts } from '../../src/core/evaluation';
import type { AttemptDetail } from '../../src/preload/contract/activities';
import { actionText, reviewText, verdictText } from '../../src/renderer/practice/labels';

// CA-134 recorriendo el catálogo de resultados: para cada tipo de actividad, cada veredicto y cada
// ayuda posible, el resultado tiene sus tres líneas (veredicto, qué revisar y una sola acción),
// ninguna vacía, sin notas de 0 a 100, sin juicios personales y sin las palabras prohibidas.

const TYPES = ['short', 'numeric', 'options', 'order', 'open'] as const;
const VERDICTS = ['correct', 'partial', 'incorrect'] as const;
const HELP: readonly (readonly HelpUse[])[] = [
  [],
  [{ kind: 'hint', level: 'A1', index: 0 }],
  [{ kind: 'hint', level: 'A2', index: 1 }],
  [{ kind: 'hint', level: 'A3', index: 2 }],
  [{ kind: 'example', level: 'A3' }],
  [{ kind: 'source', level: 'A2' }],
  [{ kind: 'solution', level: 'A4' }],
];
const NUMERIC_REASONS = ['unreadable', 'unit', 'off', null] as const;

const DETAILS: Record<(typeof TYPES)[number], AttemptDetail> = {
  short: { type: 'short', written: 'Paría', expected: 'París', diff: [] },
  numeric: { type: 'numeric', expected: 5, tolerance: 0.05, unit: 'min', reason: 'off' },
  options: {
    type: 'options',
    chosenId: 'b',
    correctId: 'a',
    correctText: 'La mediana',
    explanation: 'La media usa todos los valores.',
  },
  order: { type: 'order', given: [], correct: ['Ordenar', 'Contar'] },
  open: { type: 'open', units: [{ id: 'u1', text: 'Habla del procedimiento.' }] },
};

const FORBIDDEN = /racha|dominad|deuda|backlog/i;
const SCORE = /\b(100|\d{1,2})\s*(\/|de)\s*100\b|\bnota\b|\bpuntos?\b/i;
const JUDGEMENT = /\b(mal|tonto|vago|fracas|excelente|genio|perfecto)\b/i;
const EMOJI = /\p{Extended_Pictographic}/u;

function* catalog() {
  for (const type of TYPES) {
    for (const verdict of VERDICTS) {
      for (const used of HELP) {
        for (const numericReason of type === 'numeric' ? NUMERIC_REASONS : [null]) {
          yield { type, verdict, used, numericReason };
        }
      }
    }
  }
}

describe('el catálogo de resultados', () => {
  it('[CA-134] cada resultado posible tiene veredicto, qué revisar y una sola acción, sin notas ni juicios', () => {
    let seen = 0;
    for (const { type, verdict, used, numericReason } of catalog()) {
      const parts = resultParts({
        type,
        verdict,
        used,
        optionsQuestion: type === 'options',
        numericReason,
      });
      const lines = [
        verdictText(parts),
        reviewText(parts, DETAILS[type], ['Habla del procedimiento.']),
        actionText(parts, '2027-03-16'),
      ];
      for (const line of lines) {
        expect(line.trim()).not.toBe('');
        expect(line).not.toMatch(FORBIDDEN);
        expect(line).not.toMatch(SCORE);
        expect(line).not.toMatch(JUDGEMENT);
        expect(line).not.toMatch(EMOJI);
      }
      // Una sola acción: una oración.
      expect(lines[2]?.split(/(?<=\.)\s+/).filter((part) => part !== '')).toHaveLength(1);
      seen += 1;
    }
    expect(seen).toBe(
      TYPES.length * VERDICTS.length * HELP.length + 3 * VERDICTS.length * HELP.length,
    );
  });

  it('[CA-134] el veredicto es siempre uno de los del sistema de diseño o un «Logrado con…»', () => {
    const allowed = new Set([
      'Correcto.',
      'Vas bien.',
      'Todavía no.',
      'Logrado con pista de concepto',
      'Logrado con pista de paso',
      'Logrado con un ejemplo',
      'Logrado con la fuente',
      'Resuelto con la solución a la vista',
    ]);
    for (const { type, verdict, used, numericReason } of catalog()) {
      const parts = resultParts({
        type,
        verdict,
        used,
        optionsQuestion: type === 'options',
        numericReason,
      });
      expect(allowed.has(verdictText(parts))).toBe(true);
    }
  });
});
