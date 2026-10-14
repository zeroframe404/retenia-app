import { describe, expect, it } from 'vitest';
import {
  type CardMemory,
  DEFAULT_RETENTION,
  gradeOfVerdict,
  MEMORY_ENGINE_VERSION,
  type MemoryEvent,
  newCardMemory,
  projectCardMemory,
  reviewCard,
  UnknownEngineError,
  verdictOfGrade,
} from '../../src/core/memory';
import { studyDayOf } from '../../src/core/study-day';
import { inBuenosAires } from '../apoyo/fechas';

// La agenda de una tarjeta como proyección: se recalcula entera a partir de sus eventos, la
// configuración y la versión del motor (docs/modelo-de-datos.md, sección 1.3).

const CONFIG = { retention: DEFAULT_RETENTION };
const created = inBuenosAires('15/03/2027 10:00');

function review(seq: number, at: string, grade: 'again' | 'hard' | 'good'): MemoryEvent {
  return { kind: 'review', id: `r${seq}`, seq, occurredAt: inBuenosAires(at), grade };
}

describe('proyección de la agenda de una tarjeta', () => {
  it('sin eventos es la tarjeta nueva, que vence cuando se creó', () => {
    expect(projectCardMemory({ createdAt: created, events: [] }, CONFIG, 1)).toEqual(
      newCardMemory(created),
    );
  });

  it('[CA-016] recalcular desde los repasos da lo mismo que repasar uno por uno', () => {
    const events = [review(1, '15/03/2027 10:00', 'good'), review(2, '22/03/2027 10:00', 'hard')];
    let byHand = newCardMemory(created);
    byHand = reviewCard(byHand, 'good', inBuenosAires('15/03/2027 10:00'));
    byHand = reviewCard(byHand, 'hard', inBuenosAires('22/03/2027 10:00'));
    const projected = projectCardMemory({ createdAt: created, events }, CONFIG, 1);
    expect(projected).toEqual(byHand);
    expect(projected.reps).toBe(2);
  });

  it('«La sabía» sobre una tarjeta nueva el 15/03/2027 vence el miércoles 17/03/2027', () => {
    const projected = projectCardMemory(
      { createdAt: created, events: [review(1, '15/03/2027 10:00', 'good')] },
      CONFIG,
      MEMORY_ENGINE_VERSION,
    );
    expect(studyDayOf(projected.dueAt)).toBe('2027-03-17');
  });

  it('sigue el orden en que se registraron los repasos aunque la hora vaya para atrás', () => {
    // «Restablecer fecha» después de repasar el 22/03: el repaso siguiente dice 15/03.
    const events = [review(2, '15/03/2027 10:00', 'good'), review(1, '22/03/2027 10:00', 'good')];
    let byHand = newCardMemory(created);
    byHand = reviewCard(byHand, 'good', inBuenosAires('22/03/2027 10:00'));
    byHand = reviewCard(byHand, 'good', inBuenosAires('15/03/2027 10:00'));
    expect(projectCardMemory({ createdAt: created, events }, CONFIG, 1)).toEqual(byHand);
  });

  it('una agenda adoptada de antes del libro mayor es el punto de partida', () => {
    const adopted: CardMemory = reviewCard(
      newCardMemory(inBuenosAires('01/03/2027 10:00')),
      'good',
      inBuenosAires('01/03/2027 10:00'),
    );
    const events: MemoryEvent[] = [
      { kind: 'adopted', id: 'a1', seq: 1, memory: adopted },
      review(2, '15/03/2027 10:00', 'hard'),
    ];
    expect(
      projectCardMemory({ createdAt: created, events: events.slice(0, 1) }, CONFIG, 1),
    ).toEqual(adopted);
    expect(projectCardMemory({ createdAt: created, events }, CONFIG, 1)).toEqual(
      reviewCard(adopted, 'hard', inBuenosAires('15/03/2027 10:00')),
    );
  });

  it('usa la retención de la configuración', () => {
    const events = [review(1, '15/03/2027 10:00', 'good')];
    const at90 = projectCardMemory({ createdAt: created, events }, { retention: 0.9 }, 1);
    const at85 = projectCardMemory({ createdAt: created, events }, { retention: 0.85 }, 1);
    expect(at85.dueAt.getTime()).toBeGreaterThan(at90.dueAt.getTime());
  });

  it('con una versión del motor que no conoce, falla en vez de inventar una agenda', () => {
    expect(() => projectCardMemory({ createdAt: created, events: [] }, CONFIG, 2)).toThrow(
      UnknownEngineError,
    );
  });
});

describe('calificaciones y veredictos', () => {
  it('«La sabía» es correcta, «Con dudas» parcial y «No la sabía» incorrecta, ida y vuelta', () => {
    expect(verdictOfGrade('good')).toBe('correct');
    expect(verdictOfGrade('hard')).toBe('partial');
    expect(verdictOfGrade('again')).toBe('incorrect');
    for (const grade of ['again', 'hard', 'good'] as const) {
      expect(gradeOfVerdict(verdictOfGrade(grade))).toBe(grade);
    }
  });
});
