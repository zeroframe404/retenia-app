import { afterEach, describe, expect, it } from 'vitest';
import { newCardMemory, reviewCard } from '../../src/core/memory';
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

function seeded() {
  const space = openSpace();
  seedDemoOrganization(space.workspace);
  const count = seedDemoCardCast(space.workspace);
  return { ...space, count };
}

const subjectNamed = (workspace: Workspace, name: string) => {
  const found = workspace.subjects.list().subjects.find((subject) => subject.name === name);
  if (!found) {
    throw new Error(`falta la materia ${name}`);
  }
  return found;
};

const cardsOf = (workspace: Workspace, name: string) =>
  workspace.cards.list({ subjectId: subjectNamed(workspace, name).id });

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

  it('Estadística básica: 60 vencidas, 30 nuevas y 90 programadas', () => {
    const { workspace } = seeded();
    expect(bucketsOf(workspace, 'Estadística básica')).toEqual({ new: 30, due: 60, scheduled: 90 });
  });

  it('Historia argentina: 2 vencen hoy', () => {
    const { workspace } = seeded();
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
    const { workspace } = seeded();
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
    const { workspace } = seeded();
    for (const name of ['Estadística básica', 'Historia argentina']) {
      const questions = cardsOf(workspace, name).map((card) => card.question);
      expect(new Set(questions).size).toBe(questions.length);
    }
  });

  it('todas están «Revisadas», ninguna pausada, y ninguna tiene texto vacío', () => {
    const { workspace } = seeded();
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
    const { workspace } = seeded();
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

  it('la tarjeta de hueco «La mediana deja el {{50 %}} de los datos por debajo.»', () => {
    const { workspace } = seeded();
    const card = named(
      workspace,
      'Estadística básica',
      'La mediana deja el [...] de los datos por debajo.',
    );
    expect(card).toMatchObject({ answer: '50 %', kind: 'cloze', topicName: 'Media y dispersión' });
  });

  it('la dificultad recurrente tiene 4 fallos y es del tema Intervalos de confianza', () => {
    const { workspace } = seeded();
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
    const { workspace, file } = seeded();
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
    const { workspace } = seeded();
    const card = named(workspace, 'Estadística básica', '¿Qué es la varianza?');
    expect(card.answer).toBe('El promedio de los cuadrados de las distancias a la media.');
    expect((card.nextReviewDay ?? '') > TODAY).toBe(true);
  });

  it('once programadas llevan entre 27 y 33 días sin verse', () => {
    const { workspace } = seeded();
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
    const { workspace } = seeded();
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
    const { file } = seeded();
    const sources = readRows(
      file,
      "SELECT DISTINCT source FROM observations WHERE kind = 'review.graded'",
    ).map((row) => row.source);
    expect(sources).toEqual(['demo']);
  });

  it('cada repaso sembrado guarda la versión de la tarjeta que evaluó', () => {
    const { file } = seeded();
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
    const { workspace } = seeded();
    expect(workspace.verifyData()).toEqual([]);
  });

  it('no aparece en «Actividad reciente»', () => {
    const { workspace } = seeded();
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
