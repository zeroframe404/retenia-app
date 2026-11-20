import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type BlockDraft, normalizeDocument, revertText } from '../../src/core/materials/normalize';
import { failTask, MAX_ATTEMPTS, startTask, type TaskState } from '../../src/core/materials/queue';
import { identifyContent } from '../../src/core/materials/signature';

// Propiedades de las reglas de los materiales, con datos al azar y semilla fija.

const SEED = 20270315;
const config = { seed: SEED, numRuns: 200 };

const letters = fc.constantFrom(
  'a',
  'e',
  'n',
  'o',
  's',
  't',
  'á',
  'é',
  'ñ',
  'M',
  'é',
  'ñ',
  '-',
  ' ',
  '.',
  ',',
);
const line = fc.array(letters, { minLength: 1, maxLength: 30 }).map((parts) => parts.join(''));

describe('normalización reversible', () => {
  it('deshacer las transformaciones de cualquier documento devuelve su texto crudo', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            page: fc.integer({ min: 1, max: 3 }),
            lines: fc.array(line, { minLength: 1, maxLength: 4 }),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        (paragraphs) => {
          const drafts: BlockDraft[] = [...paragraphs]
            .sort((a, b) => a.page - b.page)
            .map(({ page, lines }, index) => ({
              type: 'paragraph',
              level: 0,
              unit: page,
              lines: lines.map((text, at) => ({
                text,
                box: { page, x: 0, y: index * 100 + at * 16, width: 300, height: 12 },
              })),
            }));
          for (const block of normalizeDocument(drafts)) {
            expect(revertText(block.normalized, block.transformations)).toBe(block.raw);
            expect(block.normalized).toBe(block.normalized.normalize('NFC'));
          }
        },
      ),
      config,
    );
  });
});

describe('cola', () => {
  it('cualquier secuencia de fallas termina en «Requiere revisión» o «falla» en a lo sumo 3 intentos', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('crashed', 'timeout', 'memory', 'unknown', 'deterministic'), {
          minLength: 3,
          maxLength: 10,
        }),
        (failures) => {
          let state: TaskState = {
            id: 't',
            status: 'pending',
            attempts: 0,
            recoveries: 0,
            runnerId: null,
            heartbeatAt: null,
          };
          for (const failure of failures) {
            if (state.status !== 'pending') {
              break;
            }
            state = failTask(startTask(state, 'a', 0), failure);
          }
          expect(['review', 'failed']).toContain(state.status);
          expect(state.attempts).toBeLessThanOrEqual(MAX_ATTEMPTS);
        },
      ),
      config,
    );
  });
});

describe('firma', () => {
  it('cualquier contenido que empieza con %PDF- es PDF, se llame como se llame', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), fc.string({ maxLength: 20 }), (tail, name) => {
        const head = new Uint8Array([...new TextEncoder().encode('%PDF-1.4\n'), ...tail]);
        expect(identifyContent({ head, size: head.length, name })).toEqual({
          ok: true,
          kind: 'pdf',
        });
      }),
      config,
    );
  });

  it('nada que no empiece como PDF pasa por PDF si el nombre dice PDF', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 200 }), (head) => {
        fc.pre(!new TextDecoder('latin1').decode(head.slice(0, 1024)).includes('%PDF-'));
        const result = identifyContent({ head, size: head.length, name: 'x.pdf' });
        expect(result).toEqual({ ok: false, problem: 'notPdf' });
      }),
      config,
    );
  });
});
