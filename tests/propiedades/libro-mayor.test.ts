import fc from 'fast-check';
import { describe, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { createCardsStore } from '../../src/data/cards';
import { openDatabase } from '../../src/data/database';
import { verifyData } from '../../src/data/projections';
import { tempDataFolder } from '../apoyo/base';
import { readRows } from '../apoyo/base-cruda';

const SEED = 20270315;

// Pedidos de repaso que pueden llegar repetidos (un doble toque, un reintento): la clave del
// intento sale de un grupo chico, así que se repite seguido, a veces con otra calificación.
const requestsArbitrary = fc.array(
  fc.record({
    attempt: fc.integer({ min: 0, max: 7 }),
    grade: fc.constantFrom('again' as const, 'hard' as const, 'good' as const),
    days: fc.integer({ min: 0, max: 3 }),
  }),
  { minLength: 1, maxLength: 14 },
);

const ATTEMPTS = Array.from(
  { length: 8 },
  (_, index) => `01969f1e-0000-4000-8000-${String(index).padStart(12, '0')}`,
);

describe('libro mayor: guardar dos veces', () => {
  it('[CA-018] guardar dos veces cualquier repaso es idempotente: queda una vez y no gasta número de secuencia', () => {
    fc.assert(
      fc.property(requestsArbitrary, (requests) => {
        const folder = tempDataFolder();
        try {
          const db = openDatabase(folder.file);
          const setup = createCardsStore(db, demoClock());
          const cards = ['A', 'B', 'C'].map(
            (question) => setup.create({ question, answer: 'R' }).id,
          );
          let offset = 0;
          const seen = new Set<string>();
          for (const request of requests) {
            offset += request.days;
            // La clave identifica el intento: el mismo intento es siempre de la misma tarjeta.
            const cardId = cards[request.attempt % 3] ?? '';
            const attemptId = ATTEMPTS[request.attempt] ?? '';
            createCardsStore(db, demoClock(offset)).review({
              cardId,
              grade: request.grade,
              attemptId,
            });
            seen.add(attemptId);
          }
          const differences = verifyData(db);
          db.close();
          const observations = readRows(folder.file, 'SELECT count(*) AS n FROM observations');
          const evaluations = readRows(folder.file, 'SELECT count(*) AS n FROM evaluations');
          const [state] = readRows(folder.file, 'SELECT last_seq FROM ledger_state');
          return (
            differences.length === 0 &&
            observations[0]?.n === seen.size &&
            evaluations[0]?.n === seen.size &&
            // Tres altas más dos eventos (observación y evaluación) por intento distinto.
            state?.last_seq === 3 + 2 * seen.size
          );
        } finally {
          folder.remove();
        }
      }),
      { seed: SEED, numRuns: 25 },
    );
    // Cada guardado espera el disco (synchronous FULL): en una máquina lenta lleva segundos.
  }, 60_000);
});
