import { join } from 'node:path';
import fc from 'fast-check';
import { describe, it } from 'vitest';
import { type Clock, demoClock } from '../../src/core/clock';
import { createCardsStore } from '../../src/data/cards';
import { openDatabase } from '../../src/data/database';
import { verifyData } from '../../src/data/projections';
import { openWorkspace } from '../../src/data/workspace';
import { tempDataFolder } from '../apoyo/base';
import { eventsById, readRows, runRaw } from '../apoyo/base-cruda';

const SEED = 20270315;

// Todo lo que se puede hacer con los datos, con índices que se reparten entre lo que hay.
const actionArbitrary = fc.oneof(
  fc.record({ action: fc.constant('create' as const) }),
  fc.record({
    action: fc.constant('edit' as const),
    pick: fc.nat(),
    text: fc.constantFrom('A', 'B', 'C'),
  }),
  fc.record({ action: fc.constant('remove' as const), pick: fc.nat() }),
  fc.record({ action: fc.constant('restore' as const), pick: fc.nat() }),
  fc.record({ action: fc.constant('empty' as const) }),
  fc.record({
    action: fc.constant('review' as const),
    pick: fc.nat(),
    attempt: fc.integer({ min: 0, max: 5 }),
    grade: fc.constantFrom('again' as const, 'hard' as const, 'good' as const),
  }),
  fc.record({ action: fc.constant('undo' as const), pick: fc.nat() }),
  fc.record({ action: fc.constant('advance' as const), days: fc.constantFrom(1, 7, 35) }),
  fc.record({ action: fc.constant('purge' as const) }),
  fc.record({ action: fc.constant('tamperAndRepair' as const), pick: fc.nat() }),
);

describe('libro mayor: ninguna operación cambia el historial', () => {
  it('[CA-015] ninguna secuencia de altas, ediciones, borrados, restauraciones, vaciados, repasos repetidos, deshacer, reparar ni avances del reloj modifica ni borra un evento', () => {
    fc.assert(
      fc.property(fc.array(actionArbitrary, { minLength: 1, maxLength: 18 }), (actions) => {
        const folder = tempDataFolder();
        let offset = 0;
        const clock: Clock = { now: () => demoClock(offset).now() };
        const workspace = openWorkspace({
          dataDir: folder.folder,
          clock,
          appVersion: '0.0.0-prueba',
        });
        const file = join(folder.folder, 'retenia.db');
        const attempts = Array.from(
          { length: 6 },
          (_, index) => `01969f1e-0000-4000-8000-${String(index).padStart(12, '0')}`,
        );
        const attemptCard = new Map<string, string>();
        try {
          workspace.cards.create({ question: 'Primera', answer: 'r' });
          for (const step of actions) {
            const before = eventsById(file);
            const active = workspace.cards.list();
            const at = <T>(list: readonly T[], pick: number) =>
              list[pick % Math.max(list.length, 1)];
            switch (step.action) {
              case 'create':
                workspace.cards.create({ question: `Nueva ${before.size}`, answer: 'r' });
                break;
              case 'edit': {
                const card = at(active, step.pick);
                if (card)
                  workspace.cards.edit({ cardId: card.id, question: step.text, answer: 'r' });
                break;
              }
              case 'remove': {
                const card = at(active, step.pick);
                if (card) workspace.cards.remove({ cardId: card.id });
                break;
              }
              case 'restore': {
                const entry = at(workspace.trash.list(), step.pick);
                if (entry) workspace.trash.restore({ entryId: entry.id });
                break;
              }
              case 'empty':
                workspace.trash.empty();
                break;
              case 'review': {
                // Un mismo intento es siempre de la misma tarjeta (la primera vez que se usa).
                const attemptId = attempts[step.attempt] ?? '';
                const cardId = attemptCard.get(attemptId) ?? at(active, step.pick)?.id;
                if (cardId && active.some((card) => card.id === cardId)) {
                  attemptCard.set(attemptId, cardId);
                  workspace.cards.review({ cardId, grade: step.grade, attemptId });
                }
                break;
              }
              case 'undo': {
                const item = at(workspace.activity.recent(), step.pick);
                if (item) workspace.activity.undo({ operationId: item.id });
                break;
              }
              case 'advance':
                offset += step.days;
                break;
              case 'purge':
                workspace.trash.purgeExpired();
                break;
              case 'tamperAndRepair': {
                const card = at(active, step.pick);
                if (card) {
                  runRaw(
                    file,
                    "UPDATE card_schedule SET due_at = '2030-01-01T00:00:00.000Z' WHERE card_id = ?",
                    card.id,
                  );
                  if (workspace.verifyData().length !== 1) return false;
                  if (workspace.repairData().length !== 0) return false;
                }
                break;
              }
            }
            const after = eventsById(file);
            for (const [id, row] of before) {
              if (after.get(id) !== row) return false;
            }
            if (workspace.verifyData().length !== 0) return false;
          }
          return true;
        } finally {
          workspace.close();
          folder.remove();
        }
      }),
      { seed: SEED, numRuns: 25 },
    );
    // Cada escritura espera el disco (synchronous FULL): en una máquina lenta lleva segundos.
  }, 120_000);
});

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
