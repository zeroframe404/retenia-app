import { forgetting_curve } from 'ts-fsrs';
import { afterEach, describe, expect, it } from 'vitest';
import cardCast from '../../datos-de-ejemplo/elenco/tarjetas.json';
import { newCardMemory, reviewCard } from '../../src/core/memory';
import { MEMORY_PARAMETERS } from '../../src/core/memory/engine';
import { studyDayOf } from '../../src/core/study-day';
import type { Workspace } from '../../src/data/workspace';
import { seedDemoCardCast, seedDemoOrganization } from '../../src/main/demo/seed';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';

// El elenco de tarjetas de la Fase 08 (solo en «Retenia (prueba)»): 180 de Estadística básica y 12
// de Historia argentina, con su historial sembrado como eventos de origen «demostración», para
// que el lunes 15/03/2027 queden 60 vencidas, 30 nuevas y 90 programadas.

afterEach(closeSpaces);

const TODAY = '2027-03-15';

// Siembra en la prueba: para las que miran el acto de sembrar (cuántas siembra, sembrar de nuevo).
function seeded() {
  const space = openSpace();
  seedDemoOrganization(space.workspace);
  const count = seedDemoCardCast(space.workspace);
  return { ...space, count };
}

// Lo sembrado, para las que solo lo leen: una copia del elenco que se sembró una vez por corrida
// con esas mismas dos líneas y el mismo reloj (tests/apoyo/elenco.ts, «tarjetas»).
function sown() {
  return openSpace({ withCast: 'tarjetas' });
}

const subjectNamed = (workspace: Workspace, name: string) => {
  const found = workspace.subjects.list().subjects.find((subject) => subject.name === name);
  if (!found) {
    throw new Error(`falta la materia ${name}`);
  }
  return found;
};

// Las tarjetas de una materia. Desde la Fase 16 la lista trae también los ejercicios, que se listan
// con su marca y no suman al 180 (historias.md, H-14): se cuentan aparte.
const cardsOf = (workspace: Workspace, name: string) =>
  workspace.cards
    .list({ subjectId: subjectNamed(workspace, name).id })
    .filter((card) => card.activityType === null);

const exercisesOf = (workspace: Workspace, name: string) =>
  workspace.cards
    .list({ subjectId: subjectNamed(workspace, name).id })
    .filter((card) => card.activityType !== null);

// Las preguntas de los ejercicios que sumó la Fase 18.
const PHASE_18 = new Set(
  (cardCast.ejercicios as { pregunta: string; procedimiento?: true; decision?: true }[])
    .filter((exercise) => exercise.procedimiento || exercise.decision)
    .map((exercise) => exercise.pregunta)
    .concat(
      (cardCast.conjuntos as { pregunta: string; tipos: { problemas: string[] }[] }[]).flatMap(
        (set) => [set.pregunta, ...set.tipos.flatMap((type) => type.problemas)],
      ),
    ),
);

const named = (workspace: Workspace, subject: string, question: string) => {
  const found = cardsOf(workspace, subject).find((card) => card.question === question);
  if (!found) {
    throw new Error(`falta la tarjeta ${question}`);
  }
  return found;
};

// Las 4 últimas calificaciones seguidas «No la sabía» sacan a la tarjeta de la cola («Mejorar la
// tarjeta»): cuenta como programada.
function inImproveList(workspace: Workspace, cardId: string): boolean {
  const results = workspace.cards.history({ cardId }).entries.map((entry) => entry.result);
  return results.length >= 4 && results.slice(-4).every((result) => result === 'again');
}

function bucketsOf(workspace: Workspace, subjectName: string) {
  const buckets = { new: 0, due: 0, scheduled: 0 };
  for (const card of cardsOf(workspace, subjectName)) {
    if (card.nextReviewDay === null) {
      buckets.new += 1;
    } else if (card.nextReviewDay <= TODAY && !inImproveList(workspace, card.id)) {
      buckets.due += 1;
    } else {
      buckets.scheduled += 1;
    }
  }
  return buckets;
}

describe('elenco de tarjetas: conteos exactos al 15/03/2027', () => {
  it('siembra 192 tarjetas: 180 de Estadística básica y 12 de Historia argentina', () => {
    const { workspace, count } = seeded();
    expect(count).toBe(192);
    expect(workspace.cards.count()).toBe(192);
    expect(cardsOf(workspace, 'Estadística básica')).toHaveLength(180);
    expect(cardsOf(workspace, 'Historia argentina')).toHaveLength(12);
    expect(cardsOf(workspace, 'Inglés')).toHaveLength(0);
    expect(cardsOf(workspace, 'Ejemplo')).toHaveLength(0);
  });

  it('Fase 16: Estadística básica trae además los 5 ejercicios del elenco, sin historial y con 3 pistas cada uno', () => {
    const { workspace } = sown();
    // Los de la Fase 18 se comprueban aparte, abajo.
    const exercises = exercisesOf(workspace, 'Estadística básica').filter(
      (exercise) => !PHASE_18.has(exercise.question),
    );
    expect(exercises.map((exercise) => [exercise.question, exercise.activityType]).sort()).toEqual(
      [
        ['Capital de Francia', 'short'],
        ['La media de 2, 4 y 9', 'numeric'],
        ['Ordená los pasos para encontrar la mediana de 7, 3 y 5', 'order'],
        [
          'Un intervalo de confianza del 95 % para la media es [4,2; 5,8]. ¿Qué significa ese 95 %?',
          'open',
        ],
        ['¿Qué medida de centro cambia menos si aparece un valor extremo?', 'options'],
      ].sort(),
    );
    for (const exercise of exercises) {
      expect(exercise.nextReviewDay).toBeNull();
      expect(workspace.cards.get({ cardId: exercise.id }).sheet.hints).toHaveLength(3);
    }
    const open = exercises.find((exercise) => exercise.activityType === 'open');
    expect(workspace.cards.get({ cardId: open?.id ?? '' }).activity).toMatchObject({
      type: 'open',
      units: [{ id: 'idea-1' }, { id: 'idea-2' }, { id: 'idea-3' }],
    });
    expect(exercisesOf(workspace, 'Historia argentina')).toHaveLength(0);
  });

  it('[CA-157] [CA-162] [CA-161] Fase 18: el procedimiento de 4 pasos con variantes, 9 problemas de 3 tipos que se confunden, 2 decisiones y el conjunto', () => {
    const { workspace } = sown();
    const exercises = exercisesOf(workspace, 'Estadística básica').filter((exercise) =>
      PHASE_18.has(exercise.question),
    );
    expect(exercises).toHaveLength(PHASE_18.size);
    const counts = new Map<string | null, number>();
    for (const exercise of exercises) {
      counts.set(exercise.activityType, (counts.get(exercise.activityType) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      procedure: 1,
      numeric: 9,
      decision: 2,
      interleaved: 1,
    });
    const detail = (question: string) =>
      workspace.cards.get({
        cardId: exercises.find((exercise) => exercise.question === question)?.id ?? '',
      });
    const procedure = detail('Calcular un intervalo de confianza para la media').activity;
    expect(procedure?.type === 'procedure' && procedure.steps).toHaveLength(4);
    expect(procedure?.type === 'procedure' && procedure.steps.filter((s) => s.key)).toHaveLength(1);
    expect(procedure?.type === 'procedure' && procedure.family).toBeTruthy();
    const set = detail('Media, mediana y moda').activity;
    expect(set?.type === 'interleaved' && set.types.map((t) => [t.name, t.cardIds.length])).toEqual(
      [
        ['Media', 3],
        ['Mediana', 3],
        ['Moda', 3],
      ],
    );
    // Solo un problema de cada tipo trae historial: «ya lo practicaste por separado».
    const practiced = exercises.filter(
      (exercise) => exercise.activityType === 'numeric' && exercise.nextReviewDay !== null,
    );
    expect(practiced).toHaveLength(3);
    for (const exercise of exercises) {
      if (exercise.activityType !== 'interleaved') {
        expect(detail(exercise.question).sheet.hints).toHaveLength(3);
      }
    }
  });

  it('Estadística básica: 60 vencidas, 30 nuevas y 90 programadas', () => {
    const { workspace } = sown();
    expect(bucketsOf(workspace, 'Estadística básica')).toEqual({ new: 30, due: 60, scheduled: 90 });
  });

  it('Historia argentina: 2 vencen hoy', () => {
    const { workspace } = sown();
    const due = cardsOf(workspace, 'Historia argentina').filter(
      (card) => card.nextReviewDay !== null && card.nextReviewDay <= TODAY,
    );
    expect(due).toHaveLength(2);
    expect(
      named(workspace, 'Historia argentina', '¿En qué año fue la Revolución de Mayo?'),
    ).toMatchObject({
      answer: '1810',
    });
    expect(due.some((card) => card.question === '¿En qué año fue la Revolución de Mayo?')).toBe(
      true,
    );
  });

  it('las 180 se reparten en los tres temas, sin tema vacío', () => {
    const { workspace } = sown();
    const byTopic = new Map<string, number>();
    for (const card of cardsOf(workspace, 'Estadística básica')) {
      byTopic.set(
        card.topicName ?? '(sin tema)',
        (byTopic.get(card.topicName ?? '(sin tema)') ?? 0) + 1,
      );
    }
    expect([...byTopic.keys()].sort()).toEqual([
      'Intervalos de confianza',
      'Media y dispersión',
      'Pruebas de hipótesis',
    ]);
    for (const total of byTopic.values()) {
      expect(total).toBeGreaterThanOrEqual(40);
    }
    expect([...byTopic.values()].reduce((a, b) => a + b, 0)).toBe(180);
  });

  it('no hay dos tarjetas con la misma pregunta dentro de una materia', () => {
    const { workspace } = sown();
    for (const name of ['Estadística básica', 'Historia argentina']) {
      const questions = cardsOf(workspace, name).map((card) => card.question);
      expect(new Set(questions).size).toBe(questions.length);
    }
  });

  it('todas están «Revisadas», ninguna pausada, y ninguna tiene texto vacío', () => {
    const { workspace } = sown();
    for (const card of workspace.cards.list()) {
      expect(card.sheetState).toBe('reviewed');
      expect(card.paused).toBe(false);
      expect(card.question.trim()).not.toBe('');
      expect(card.answer.trim()).not.toBe('');
    }
  });
});

describe('elenco de tarjetas: las que tienen nombre propio', () => {
  it('«¿Qué mide el desvío estándar?» es la más atrasada de las vencidas (vence el 25/02/2027, hace 18 días) y se vio por última vez el 20/02/2027 con dudas', () => {
    const { workspace } = sown();
    const card = named(workspace, 'Estadística básica', '¿Qué mide el desvío estándar?');
    expect(card.answer).toBe('Cuánto se alejan, en promedio, los datos de la media.');
    expect(card.topicName).toBe('Media y dispersión');
    expect(card.nextReviewDay).not.toBeNull();
    const due = cardsOf(workspace, 'Estadística básica').filter(
      (other) =>
        other.nextReviewDay !== null &&
        other.nextReviewDay <= TODAY &&
        !inImproveList(workspace, other.id),
    );
    const earliest = Math.min(...due.map((other) => Date.parse(other.nextReviewDay ?? '')));
    expect(Date.parse(card.nextReviewDay ?? '')).toBe(earliest);
    expect(due.filter((other) => other.nextReviewDay === card.nextReviewDay)).toHaveLength(1);
    expect(card.nextReviewDay).toBe('2027-02-25');
    const history = workspace.cards.history({ cardId: card.id }).entries;
    expect(history.at(-1)).toMatchObject({ day: '2027-02-20', result: 'hard' });
  });

  it('«¿Qué mide el desvío estándar?» es la vencida de Estadística básica con menos probabilidad de recordarla (0,77) y ninguna otra se le acerca a menos de una centésima', () => {
    const { workspace, file } = sown();
    const statistics = subjectNamed(workspace, 'Estadística básica');
    const rows = readRows(
      file,
      `SELECT c.id AS id, s.stability AS stability, s.last_review_at AS last
         FROM cards c JOIN card_schedule s ON s.card_id = c.id
        WHERE c.subject_id = ? AND s.reps > 0`,
      statistics.id,
    );
    const byId = new Map(rows.map((row) => [String(row.id), row]));
    const due = cardsOf(workspace, 'Estadística básica').filter(
      (card) =>
        card.nextReviewDay !== null &&
        card.nextReviewDay <= TODAY &&
        !inImproveList(workspace, card.id),
    );
    expect(due).toHaveLength(60);
    const recall = (cardId: string) => {
      const row = byId.get(cardId);
      const elapsed =
        (Date.parse(TODAY) - Date.parse(studyDayOf(new Date(String(row?.last))))) / 86_400_000;
      return forgetting_curve([...MEMORY_PARAMETERS], elapsed, Number(row?.stability));
    };
    const sorted = due
      .map((card) => ({ question: card.question, recall: recall(card.id) }))
      .sort((a, b) => a.recall - b.recall);
    expect(sorted[0]?.question).toBe('¿Qué mide el desvío estándar?');
    expect(sorted[0]?.recall).toBeCloseTo(0.7713, 4);
    expect((sorted[1]?.recall ?? 0) - (sorted[0]?.recall ?? 0)).toBeGreaterThan(0.01);
  });

  it('la tarjeta de hueco «La mediana deja el {{50 %}} de los datos por debajo.»', () => {
    const { workspace } = sown();
    const card = named(
      workspace,
      'Estadística básica',
      'La mediana deja el [...] de los datos por debajo.',
    );
    expect(card).toMatchObject({ answer: '50 %', kind: 'cloze', topicName: 'Media y dispersión' });
  });

  it('la dificultad recurrente tiene 4 fallos y es del tema Intervalos de confianza', () => {
    const { workspace } = sown();
    const card = named(
      workspace,
      'Estadística básica',
      '¿Qué significa el 95 % en un intervalo de confianza del 95 %?',
    );
    expect(card.topicName).toBe('Intervalos de confianza');
    const results = workspace.cards.history({ cardId: card.id }).entries.map((e) => e.result);
    expect(results.filter((result) => result === 'again')).toHaveLength(4);
    expect(inImproveList(workspace, card.id)).toBe(true);
  });

  it('la consolidada «¿Qué es la media muestral?» tiene 3 aciertos en días distintos, uno con 7 o más días de demora, y está programada', () => {
    const { workspace, file } = sown();
    const card = named(workspace, 'Estadística básica', '¿Qué es la media muestral?');
    expect(card.topicName).toBe('Media y dispersión');
    expect(card.nextReviewDay).not.toBeNull();
    expect((card.nextReviewDay ?? '') > TODAY).toBe(true);
    const entries = workspace.cards.history({ cardId: card.id }).entries;
    expect(entries.map((entry) => entry.result)).toEqual(['good', 'good', 'good']);
    expect(new Set(entries.map((entry) => entry.day)).size).toBe(3);

    const created = readRows(file, 'SELECT created_at FROM cards WHERE id = ?', card.id)[0];
    const events = readRows(
      file,
      "SELECT occurred_at FROM observations WHERE kind = 'review.graded' AND card_id = ? ORDER BY seq",
      card.id,
    );
    let memory = newCardMemory(new Date(String(created?.created_at)));
    const delays: number[] = [];
    for (const event of events) {
      const at = new Date(String(event.occurred_at));
      if (memory.lastReviewAt !== null) {
        delays.push((at.getTime() - memory.dueAt.getTime()) / 86_400_000);
      }
      memory = reviewCard(memory, 'good', at);
    }
    expect(Math.max(...delays)).toBeGreaterThanOrEqual(7);
  });

  it('«¿Qué es la varianza?» está programada', () => {
    const { workspace } = sown();
    const card = named(workspace, 'Estadística básica', '¿Qué es la varianza?');
    expect(card.answer).toBe('El promedio de los cuadrados de las distancias a la media.');
    expect((card.nextReviewDay ?? '') > TODAY).toBe(true);
  });

  it('once programadas llevan entre 27 y 33 días sin verse', () => {
    const { workspace } = sown();
    const stale = cardsOf(workspace, 'Estadística básica').filter((card) => {
      if (card.nextReviewDay === null || card.nextReviewDay <= TODAY) {
        return false;
      }
      const last = workspace.cards.history({ cardId: card.id }).entries.at(-1);
      if (!last) {
        return false;
      }
      const days = (Date.parse(TODAY) - Date.parse(last.day)) / 86_400_000;
      return days >= 27 && days <= 33;
    });
    expect(stale).toHaveLength(11);
  });

  it('tres tarjetas nacieron en la nota «Intervalos de confianza»: una con «>>» y dos hermanas de un renglón con dos huecos, todas con historial', () => {
    const { workspace } = sown();
    const born = cardsOf(workspace, 'Estadística básica')
      .map((card) => workspace.cards.get({ cardId: card.id }))
      .filter((card) => card.path.noteTitle === 'Intervalos de confianza');
    expect(born).toHaveLength(3);
    expect(born.filter((card) => card.kind === 'qa')).toHaveLength(1);
    const clozes = born.filter((card) => card.kind === 'cloze');
    expect(clozes).toHaveLength(2);
    expect(clozes[0]?.siblingGroupId).not.toBeNull();
    expect(clozes[0]?.siblingGroupId).toBe(clozes[1]?.siblingGroupId);
    for (const card of born) {
      expect(card.path.canOpenNote).toBe(true);
      expect(workspace.cards.history({ cardId: card.id }).entries.length).toBeGreaterThan(0);
    }
  });
});

describe('elenco de tarjetas: el historial es de la demostración', () => {
  it('todos los repasos sembrados son eventos de origen «demo» y ninguno es de «user»', () => {
    const { file } = sown();
    const sources = readRows(
      file,
      "SELECT DISTINCT source FROM observations WHERE kind = 'review.graded'",
    ).map((row) => row.source);
    expect(sources).toEqual(['demo']);
  });

  it('cada repaso sembrado guarda la versión de la tarjeta que evaluó', () => {
    const { file } = sown();
    const missing = readRows(
      file,
      "SELECT payload FROM observations WHERE kind = 'review.graded'",
    ).filter(
      (row) =>
        typeof (JSON.parse(String(row.payload)) as { versionId?: string }).versionId !== 'string',
    );
    expect(missing).toEqual([]);
  });

  it('«Verificar datos» no encuentra diferencias', () => {
    const { workspace } = sown();
    expect(workspace.verifyData()).toEqual([]);
  });

  it('no aparece en «Actividad reciente»', () => {
    const { workspace } = sown();
    expect(workspace.activity.recent()).toEqual([]);
  });

  it('sembrar de nuevo, o abrir otra vez la misma carpeta, no duplica nada', () => {
    const { workspace, reopen } = seeded();
    expect(seedDemoCardCast(workspace)).toBe(0);
    const again = reopen();
    expect(again.cards.count()).toBe(192);
    expect(seedDemoCardCast(again)).toBe(0);
    expect(again.cards.count()).toBe(192);
  });

  it('no siembra encima de lo que escribiste vos, ni lo toca', () => {
    const space = openSpace();
    seedDemoOrganization(space.workspace);
    const subject = subjectNamed(space.workspace, 'Estadística básica');
    space.workspace.cards.create({
      question: '¿Capital de Francia?',
      answer: 'París',
      subjectId: subject.id,
    });
    expect(seedDemoCardCast(space.workspace)).toBe(0);
    expect(cardsOf(space.workspace, 'Estadística básica').map((c) => c.question)).toContain(
      '¿Capital de Francia?',
    );
  });

  it('el día de estudio de hoy es el lunes 15/03/2027', () => {
    expect(studyDayOf(new Date('2027-03-15T10:00:00-03:00'))).toBe(TODAY);
  });
});
