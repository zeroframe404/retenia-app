import { describe, expect, it } from 'vitest';
import {
  ACTIVE_RETENTION,
  engineGradeOf,
  type Grade,
  type MemoryEvent,
  traceCardMemory,
} from '../../src/core/memory';
import { studyDayOf } from '../../src/core/study-day';
import { inBuenosAires } from '../apoyo/fechas';

// Fase 16: lo que llega al motor de un intento sobre una pregunta de opciones y de un intento
// afectado («La pregunta era ambigua», «La referencia es incorrecta»).

const CARD = '01969f1e-0000-7000-8000-00000000e1e5';
const created = inBuenosAires('15/03/2027 10:00');

let seq = 0;
function attempt(
  at: string,
  grade: Grade,
  extra: { optionsQuestion?: boolean; defective?: boolean } = {},
): MemoryEvent {
  seq += 1;
  return { kind: 'review', id: `i${seq}`, seq, occurredAt: inBuenosAires(at), grade, ...extra };
}
const trace = (events: MemoryEvent[]) =>
  traceCardMemory({ cardId: CARD, createdAt: created, events }, { retention: ACTIVE_RETENTION });

describe('motor de memoria: opciones y afectados', () => {
  it('[CA-133] un acierto en una pregunta de opciones llega como «Con dudas», nunca como «La sabía»', () => {
    expect(engineGradeOf({ grade: 'good', optionsQuestion: true })).toBe('hard');
    expect(engineGradeOf({ grade: 'again', optionsQuestion: true })).toBe('again');
  });

  it('[CA-133] acertar una de opciones programa igual que «Con dudas»', () => {
    const options = trace([attempt('15/03/2027 10:05', 'good', { optionsQuestion: true })]);
    const doubtful = trace([attempt('15/03/2027 10:05', 'hard')]);
    expect(studyDayOf(options.memory.dueAt)).toBe(studyDayOf(doubtful.memory.dueAt));
  });

  it('[CA-142] un intento afectado queda anotado y no llega al motor: un fallo así no es un olvido', () => {
    const first = attempt('15/03/2027 10:05', 'good');
    const affected = attempt('18/03/2027 10:05', 'again', { defective: true });
    const { memory, steps } = trace([first, affected]);
    expect(memory.lapses).toBe(0);
    expect(steps.find((step) => step.id === affected.id)?.counted).toBe(false);
    expect(memory).toEqual(trace([first]).memory);
  });
});
