import { afterEach, describe, expect, it } from 'vitest';
import {
  MEMORY_ENGINE_VERSION,
  MEMORY_PARAMETERS_VERSION,
  projectCardMemory,
  recallProbability,
} from '../../src/core/memory';
import type { Workspace } from '../../src/data/workspace';
import { seedDemoCardCast, seedDemoOrganization } from '../../src/main/demo/seed';
import { readRows, runRaw } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';
import { inBuenosAires } from '../apoyo/fechas';

// El motor de memoria de la Fase 09 contra una base real: la retención según el estado de la
// materia, «Deshacer» un repaso, lo que se guarda con cada intento, un solo repaso por día y el
// recálculo del elenco entero.

afterEach(closeSpaces);

let attempts = 0;
const attempt = () => {
  attempts += 1;
  return `01969f1e-0000-4000-8000-${String(attempts).padStart(12, '0')}`;
};

function twoSubjects(workspace: Workspace) {
  const active = workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
  const kept = workspace.subjects.create({ name: 'Historia argentina' });
  return { active, kept };
}

function newCard(workspace: Workspace, subjectId: string, question = '¿Pregunta?') {
  return workspace.cards.create({ question, answer: 'Respuesta', subjectId });
}

// Una tarjeta con un historial de antes (sembrado como el de la demostración).
function withPast(
  workspace: Workspace,
  subjectId: string,
  reviews: { at: string; grade: 'again' | 'hard' | 'good' }[],
) {
  const card = newCard(workspace, subjectId, `Con historia ${attempt()}`);
  workspace.cards.plantHistory([
    {
      cardId: card.id,
      createdAt: inBuenosAires('01/03/2027 10:00'),
      reviews: reviews.map((review) => ({ at: inBuenosAires(review.at), grade: review.grade })),
    },
  ]);
  return card;
}

const schedule = (file: string, cardId: string) =>
  readRows(file, 'SELECT * FROM card_schedule WHERE card_id = ?', cardId)[0];

const reviewPayloads = (file: string, cardId: string) =>
  readRows(
    file,
    "SELECT payload, schema_version FROM observations WHERE kind = 'review.graded' AND card_id = ? ORDER BY seq",
    cardId,
  ).map(
    (row): Record<string, unknown> => ({
      ...(JSON.parse(String(row.payload)) as Record<string, unknown>),
      schemaVersion: row.schema_version,
    }),
  );

describe('motor de memoria: la retención objetivo según la materia', () => {
  it('[CA-060] una tarjeta nueva de una materia en mantenimiento con «La sabía» el 15/03/2027 vuelve el viernes 19/03/2027; en la activa, el miércoles 17/03/2027', () => {
    const { workspace, file } = openSpace();
    const { active, kept } = twoSubjects(workspace);
    const inActive = newCard(workspace, active.id);
    const inKept = newCard(workspace, kept.id);
    expect(
      workspace.cards.review({ cardId: inActive.id, grade: 'good', attemptId: attempt() })
        .nextReviewDay,
    ).toBe('2027-03-17');
    expect(
      workspace.cards.review({ cardId: inKept.id, grade: 'good', attemptId: attempt() })
        .nextReviewDay,
    ).toBe('2027-03-19');
    expect(schedule(file, inActive.id)).toMatchObject({ retention_target: 0.9 });
    expect(schedule(file, inKept.id)).toMatchObject({ retention_target: 0.85 });
  });

  it('[CA-060] la retención se toma del estado de la materia al calcular: «Hacer activa» reprograma las tarjetas de las dos, y deshacerlo las devuelve', () => {
    const { workspace } = openSpace();
    const { active, kept } = twoSubjects(workspace);
    const card = newCard(workspace, active.id);
    workspace.cards.review({ cardId: card.id, grade: 'good', attemptId: attempt() });
    const other = newCard(workspace, kept.id);
    workspace.cards.review({ cardId: other.id, grade: 'good', attemptId: attempt() });

    workspace.subjects.activate({ subjectId: kept.id });
    expect(workspace.cards.get({ cardId: card.id }).nextReviewDay).toBe('2027-03-19');
    expect(workspace.cards.get({ cardId: other.id }).nextReviewDay).toBe('2027-03-17');
    expect(workspace.verifyData()).toEqual([]);

    const activation = workspace.activity.recent().find((item) => item.kind === 'subject.activate');
    expect(workspace.activity.undo({ operationId: activation?.id ?? '' }).undone).toBe(true);
    expect(workspace.cards.get({ cardId: card.id }).nextReviewDay).toBe('2027-03-17');
    expect(workspace.cards.get({ cardId: other.id }).nextReviewDay).toBe('2027-03-19');
    expect(workspace.verifyData()).toEqual([]);
  });
});

describe('motor de memoria: el elenco entero', () => {
  function seeded() {
    const space = openSpace();
    seedDemoOrganization(space.workspace);
    seedDemoCardCast(space.workspace);
    return space;
  }

  it('[CA-062] recalcular desde cero la agenda de las 192 tarjetas da exactamente las mismas fechas', () => {
    const { workspace, file } = seeded();
    expect(workspace.verifyData()).toEqual([]);
    const before = readRows(file, 'SELECT * FROM card_schedule ORDER BY card_id');
    expect(before).toHaveLength(192);
    runRaw(file, 'DELETE FROM card_schedule');
    expect(workspace.verifyData()).toHaveLength(192);
    expect(workspace.repairData()).toEqual([]);
    expect(readRows(file, 'SELECT * FROM card_schedule ORDER BY card_id')).toEqual(before);
    expect(before.every((row) => row.engine_version === MEMORY_ENGINE_VERSION)).toBe(true);
  });

  it('[CA-065] «¿Por qué hoy?» de «¿Qué mide el desvío estándar?»: hace 23 días, te costó, unos 7 de cada 10', () => {
    const { workspace } = seeded();
    const card = workspace.cards
      .list()
      .find((item) => item.question === '¿Qué mide el desvío estándar?');
    expect(workspace.cards.whyToday({ cardId: card?.id ?? '' })).toEqual({
      kind: 'seen',
      daysSince: 23,
      lastResult: 'hard',
      outOfTen: 7,
      general: true,
    });
  });

  it('«¿Por qué hoy?» de «¿Qué significa el 95 % en un intervalo de confianza del 95 %?»: ayer, no te salió, unos 6 de cada 10', () => {
    const { workspace } = seeded();
    const card = workspace.cards
      .list()
      .find(
        (item) => item.question === '¿Qué significa el 95 % en un intervalo de confianza del 95 %?',
      );
    expect(workspace.cards.whyToday({ cardId: card?.id ?? '' })).toEqual({
      kind: 'seen',
      daysSince: 1,
      lastResult: 'again',
      outOfTen: 6,
      general: true,
    });
  });
});

describe('motor de memoria: deshacer un repaso', () => {
  it('[CA-063] deshacer el repaso recién hecho agrega «review.annulled», el próximo repaso vuelve a ser exactamente el anterior y el historial lo marca anulado', () => {
    const { workspace, file } = openSpace();
    const { active } = twoSubjects(workspace);
    const card = withPast(workspace, active.id, [{ at: '10/03/2027 10:00', grade: 'good' }]);
    const before = schedule(file, card.id);
    expect(workspace.cards.get({ cardId: card.id }).nextReviewDay).toBe('2027-03-12');

    const attemptId = attempt();
    const reviewed = workspace.cards.review({ cardId: card.id, grade: 'hard', attemptId });
    expect(reviewed.nextReviewDay).not.toBe('2027-03-12');

    const undone = workspace.cards.undoReview({ cardId: card.id, attemptId });
    expect(undone.nextReviewDay).toBe('2027-03-12');
    expect(schedule(file, card.id)).toEqual(before);

    const annulments = readRows(
      file,
      "SELECT payload FROM observations WHERE kind = 'review.annulled'",
    ).map((row) => JSON.parse(String(row.payload)));
    const reviewId = readRows(
      file,
      'SELECT id FROM observations WHERE idempotency_key = ?',
      `review:${attemptId}`,
    )[0]?.id;
    expect(annulments).toEqual([{ cardId: card.id, reviewId }]);

    const entries = workspace.cards.history({ cardId: card.id }).entries;
    expect(entries.map((entry) => [entry.result, entry.annulled])).toEqual([
      ['good', false],
      ['hard', true],
    ]);
    expect(workspace.verifyData()).toEqual([]);
  });

  it('[CA-063] deshacer el primer repaso de una tarjeta nueva la deja otra vez sin repasar', () => {
    const { workspace } = openSpace();
    const { active } = twoSubjects(workspace);
    const card = newCard(workspace, active.id);
    const attemptId = attempt();
    workspace.cards.review({ cardId: card.id, grade: 'good', attemptId });
    expect(workspace.cards.undoReview({ cardId: card.id, attemptId }).nextReviewDay).toBeNull();
  });

  it('[CA-063] deshacer dos veces el mismo repaso no agrega nada; uno que no existe o de otra tarjeta se rechaza', () => {
    const { workspace, file } = openSpace();
    const { active } = twoSubjects(workspace);
    const card = newCard(workspace, active.id);
    const other = newCard(workspace, active.id, 'Otra');
    const attemptId = attempt();
    workspace.cards.review({ cardId: card.id, grade: 'good', attemptId });
    workspace.cards.undoReview({ cardId: card.id, attemptId });
    workspace.cards.undoReview({ cardId: card.id, attemptId });
    expect(
      readRows(file, "SELECT id FROM observations WHERE kind = 'review.annulled'"),
    ).toHaveLength(1);
    expect(() => workspace.cards.undoReview({ cardId: card.id, attemptId: attempt() })).toThrow();
    expect(() => workspace.cards.undoReview({ cardId: other.id, attemptId })).toThrow();
  });

  it('[CA-063] después de deshacer, repasar otra vez igual deja la tarjeta como si no se hubiera deshecho', () => {
    const { workspace, file } = openSpace();
    const { active } = twoSubjects(workspace);
    const card = withPast(workspace, active.id, [{ at: '10/03/2027 10:00', grade: 'good' }]);
    const first = attempt();
    workspace.cards.review({ cardId: card.id, grade: 'good', attemptId: first });
    const done = schedule(file, card.id);
    workspace.cards.undoReview({ cardId: card.id, attemptId: first });
    workspace.cards.review({ cardId: card.id, grade: 'good', attemptId: attempt() });
    expect(schedule(file, card.id)).toEqual(done);
  });
});

describe('motor de memoria: lo que se guarda con cada intento', () => {
  it('la probabilidad que predecía el motor, el intervalo real en días, la regla por la que apareció y la versión del motor y de sus parámetros', () => {
    const { workspace, file } = openSpace();
    const { active } = twoSubjects(workspace);

    const fresh = newCard(workspace, active.id);
    workspace.cards.review({ cardId: fresh.id, grade: 'good', attemptId: attempt() });
    expect(reviewPayloads(file, fresh.id)).toEqual([
      expect.objectContaining({
        schemaVersion: 2,
        grade: 'good',
        helpLevel: 'A0',
        predictedRecall: null,
        elapsedDays: null,
        rule: 'due',
        engineVersion: MEMORY_ENGINE_VERSION,
        parametersVersion: MEMORY_PARAMETERS_VERSION,
        retention: 0.9,
        fuzz: false,
      }),
    ]);

    const overdue = withPast(workspace, active.id, [{ at: '10/03/2027 10:00', grade: 'good' }]);
    const expected = recallProbability(
      projectCardMemory(
        {
          createdAt: inBuenosAires('01/03/2027 10:00'),
          events: [
            {
              kind: 'review',
              id: 'r1',
              seq: 1,
              occurredAt: inBuenosAires('10/03/2027 10:00'),
              grade: 'good',
            },
          ],
        },
        { retention: 0.9 },
        MEMORY_ENGINE_VERSION,
      ),
      '2027-03-15',
    );
    workspace.cards.review({ cardId: overdue.id, grade: 'hard', attemptId: attempt() });
    const last = reviewPayloads(file, overdue.id).at(-1);
    expect(last).toMatchObject({ elapsedDays: 5, rule: 'due', schemaVersion: 2 });
    expect(last?.predictedRecall).toBeCloseTo(expected ?? -1, 8);
    expect(last?.predictedRecall).toBeGreaterThan(0.8);
    expect(last?.predictedRecall).toBeLessThan(0.9);

    const early = withPast(workspace, active.id, [{ at: '14/03/2027 10:00', grade: 'good' }]);
    workspace.cards.review({ cardId: early.id, grade: 'good', attemptId: attempt() });
    expect(reviewPayloads(file, early.id).at(-1)).toMatchObject({ rule: 'chosen', elapsedDays: 1 });

    const failed = newCard(workspace, active.id, 'Fallada hoy');
    workspace.cards.review({ cardId: failed.id, grade: 'again', attemptId: attempt() });
    workspace.cards.review({ cardId: failed.id, grade: 'good', attemptId: attempt() });
    expect(reviewPayloads(file, failed.id).map((payload) => payload.rule)).toEqual([
      'due',
      'relearning',
    ]);
  });

  it('los repasos sembrados de la demostración también guardan su versión del motor, sin variación al azar', () => {
    const { workspace, file } = openSpace();
    const { active } = twoSubjects(workspace);
    const card = withPast(workspace, active.id, [
      { at: '05/03/2027 10:00', grade: 'good' },
      { at: '07/03/2027 10:00', grade: 'again' },
    ]);
    expect(reviewPayloads(file, card.id)).toEqual([
      expect.objectContaining({ rule: 'due', elapsedDays: null, fuzz: false, engineVersion: 2 }),
      expect.objectContaining({ rule: 'due', elapsedDays: 2, fuzz: false, engineVersion: 2 }),
    ]);
  });

  it('[CA-064] un acierto con pista de concepto se guarda con su ayuda y el motor lo toma como «Con dudas»', () => {
    const { workspace, file } = openSpace();
    const { active } = twoSubjects(workspace);
    const card = newCard(workspace, active.id);
    const reviewed = workspace.cards.review({
      cardId: card.id,
      grade: 'good',
      attemptId: attempt(),
      helpLevel: 'A2',
    });
    expect(reviewed.nextReviewDay).toBe('2027-03-16');
    expect(reviewPayloads(file, card.id)[0]).toMatchObject({ grade: 'good', helpLevel: 'A2' });
    expect(workspace.cards.history({ cardId: card.id }).entries[0]?.result).toBe('good');
  });
});

describe('motor de memoria: un solo repaso por día', () => {
  it('al motor solo le llega el primer intento del día: el segundo queda en el historial, marcado, y no cambia la fecha', () => {
    const { workspace } = openSpace();
    const { active } = twoSubjects(workspace);
    const card = newCard(workspace, active.id);
    workspace.cards.review({ cardId: card.id, grade: 'again', attemptId: attempt() });
    const again = workspace.cards.review({ cardId: card.id, grade: 'good', attemptId: attempt() });
    expect(again.nextReviewDay).toBe('2027-03-16');
    expect(
      workspace.cards
        .history({ cardId: card.id })
        .entries.map((entry) => [entry.result, entry.skipped]),
    ).toEqual([
      ['again', null],
      ['good', 'sameDay'],
    ]);
  });

  it('un repaso con una fecha anterior al último que contó (la fecha volvió atrás) no cambia la fecha, se marca como tal y «¿Por qué hoy?» no dice «hoy»', () => {
    const { workspace } = openSpace();
    const { active } = twoSubjects(workspace);
    const card = withPast(workspace, active.id, [{ at: '22/03/2027 10:00', grade: 'good' }]);
    expect(workspace.cards.whyToday({ cardId: card.id })).toEqual({ kind: 'ahead', general: true });
    const before = workspace.cards.get({ cardId: card.id }).nextReviewDay;
    const after = workspace.cards.review({ cardId: card.id, grade: 'again', attemptId: attempt() });
    expect(after.nextReviewDay).toBe(before);
    expect(
      workspace.cards.history({ cardId: card.id }).entries.map((entry) => entry.skipped),
    ).toEqual([null, 'earlier']);
  });
});

describe('motor de memoria: versiones y variación al azar', () => {
  it('una agenda calculada con el motor de antes (versión 1) se recalcula sola con el motor 2 al abrir', () => {
    const space = openSpace();
    const { kept } = twoSubjects(space.workspace);
    const card = newCard(space.workspace, kept.id);
    space.workspace.cards.review({ cardId: card.id, grade: 'good', attemptId: attempt() });
    // Como la dejaba la Fase 08: motor 1, retención fija de 0,90 y vuelta a los 2 días.
    runRaw(
      space.file,
      "UPDATE card_schedule SET engine_version = 1, retention_target = 0.9, due_at = '2027-03-17T13:00:00.000Z', scheduled_days = 2 WHERE card_id = ?",
      card.id,
    );
    const reopened = space.reopen();
    expect(schedule(space.file, card.id)).toMatchObject({
      engine_version: 2,
      retention_target: 0.85,
      scheduled_days: 4,
    });
    expect(reopened.cards.get({ cardId: card.id }).nextReviewDay).toBe('2027-03-19');
    expect(reopened.verifyData()).toEqual([]);
  });

  it('con la variación al azar (uso real) la fecha es la que da el motor con la semilla de esa tarjeta, el intento lo anota y recalcular da lo mismo aunque se abra sin variación', () => {
    const space = openSpace({ fuzz: true });
    const { active } = twoSubjects(space.workspace);
    const past = [
      { at: '01/03/2027 10:00', grade: 'good' as const },
      { at: '03/03/2027 10:00', grade: 'good' as const },
    ];
    // Lo que da el motor para esta historia y un «La sabía» el 15/03, con o sin variación: sin
    // variación son 49 días (el 03/05/2027).
    const intervalFor = (cardId: string, fuzz: boolean) =>
      projectCardMemory(
        {
          cardId,
          createdAt: inBuenosAires('01/03/2027 10:00'),
          events: [
            ...past.map((review, index) => ({
              kind: 'review' as const,
              id: `p${index}`,
              seq: index + 1,
              occurredAt: inBuenosAires(review.at),
              grade: review.grade,
            })),
            {
              kind: 'review',
              id: 'u',
              seq: 3,
              occurredAt: inBuenosAires('15/03/2027 10:00'),
              grade: 'good',
              fuzz,
            },
          ],
        },
        { retention: 0.9 },
        MEMORY_ENGINE_VERSION,
      ).scheduledDays;
    // Una tarjeta cuya semilla la corre de los 49 días: así se ve que la variación se aplica de
    // verdad (el resultado no depende de cuál salga: se compara con el motor para esa tarjeta).
    let card = withPast(space.workspace, active.id, past);
    for (let turn = 0; turn < 30 && intervalFor(card.id, true) === 49; turn += 1) {
      card = withPast(space.workspace, active.id, past);
    }
    expect(intervalFor(card.id, false)).toBe(49);
    expect(intervalFor(card.id, true)).not.toBe(49);
    space.workspace.cards.review({ cardId: card.id, grade: 'good', attemptId: attempt() });
    expect(reviewPayloads(space.file, card.id).at(-1)).toMatchObject({ fuzz: true });
    const days = Number(schedule(space.file, card.id)?.scheduled_days);
    expect(days).toBe(intervalFor(card.id, true));
    expect(space.workspace.verifyData()).toEqual([]);
    // La variación queda anotada en cada intento: abrir la misma carpeta sin variación no cambia
    // ninguna fecha.
    const plain = space.reopen({ fuzz: false });
    expect(plain.verifyData()).toEqual([]);
    expect(Number(schedule(space.file, card.id)?.scheduled_days)).toBe(days);
  });
});
