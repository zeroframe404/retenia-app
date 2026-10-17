import { describe, expect, it } from 'vitest';
import { compareSchedules, type ScheduleRow, scheduleRowOf } from '../../src/core/data-check';
import { newCardMemory, reviewCard } from '../../src/core/memory';
import { inBuenosAires } from '../apoyo/fechas';

// «Verificar datos» compara la agenda guardada de cada tarjeta con la que sale de recalcular su
// historial, campo por campo.

const at = inBuenosAires('15/03/2027 10:00');
const reviewed = reviewCard(newCardMemory(at), 'good', at);
const row = (cardId: string): ScheduleRow => scheduleRowOf(cardId, reviewed, 0.9);

describe('verificar datos: comparar lo guardado con lo recalculado', () => {
  it('pasa la memoria de una tarjeta a una fila de agenda con fechas en UTC', () => {
    expect(row('t1')).toEqual({
      cardId: 't1',
      state: reviewed.state,
      stability: reviewed.stability,
      difficulty: reviewed.difficulty,
      dueAt: reviewed.dueAt.toISOString(),
      lastReviewAt: at.toISOString(),
      reps: 1,
      lapses: 0,
      scheduledDays: reviewed.scheduledDays,
      retentionTarget: 0.9,
    });
    expect(scheduleRowOf('t2', newCardMemory(at), 0.9).lastReviewAt).toBeNull();
  });

  it('[CA-016] sin cambios da 0 diferencias', () => {
    expect(compareSchedules([row('t1'), row('t2')], [row('t1'), row('t2')])).toEqual([]);
  });

  it('[CA-016] una fecha de próximo repaso distinta es una diferencia de fecha, con las dos fechas', () => {
    const stored = { ...row('t1'), dueAt: '2027-03-20T13:00:00.000Z' };
    expect(compareSchedules([stored], [row('t1')])).toEqual([
      {
        cardId: 't1',
        kind: 'due',
        storedDueAt: '2027-03-20T13:00:00.000Z',
        expectedDueAt: row('t1').dueAt,
      },
    ]);
  });

  it('[CA-016] cualquier otro dato de memoria distinto es una diferencia de memoria', () => {
    for (const change of [
      { reps: 7 },
      { lapses: 2 },
      { state: 0 },
      { stability: 1.5 },
      { difficulty: 9 },
      { scheduledDays: 40 },
      { lastReviewAt: null },
      { retentionTarget: 0.85 },
    ]) {
      const stored = { ...row('t1'), ...change };
      expect(compareSchedules([stored], [row('t1')]), JSON.stringify(change)).toEqual([
        {
          cardId: 't1',
          kind: 'memory',
          storedDueAt: row('t1').dueAt,
          expectedDueAt: row('t1').dueAt,
        },
      ]);
    }
  });

  it('[CA-016] una tarjeta sin agenda guardada falta, y una agenda sin tarjeta sobra', () => {
    expect(compareSchedules([row('t2')], [row('t1')])).toEqual([
      { cardId: 't1', kind: 'missing', storedDueAt: null, expectedDueAt: row('t1').dueAt },
      { cardId: 't2', kind: 'extra', storedDueAt: row('t2').dueAt, expectedDueAt: null },
    ]);
  });

  it('el orden de lo guardado no importa', () => {
    expect(compareSchedules([row('t2'), row('t1')], [row('t1'), row('t2')])).toEqual([]);
  });
});
