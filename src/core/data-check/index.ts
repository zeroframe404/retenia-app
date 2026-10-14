import type { CardMemory } from '../memory';

// «Verificar datos»: la agenda guardada de cada tarjeta contra la que sale de recalcular su
// historial, campo por campo (docs/modelo-de-datos.md, regla 2).

export interface ScheduleRow {
  readonly cardId: string;
  readonly state: number;
  readonly stability: number;
  readonly difficulty: number;
  readonly dueAt: string;
  readonly lastReviewAt: string | null;
  readonly reps: number;
  readonly lapses: number;
  readonly scheduledDays: number;
  readonly retentionTarget: number;
}

export function scheduleRowOf(cardId: string, memory: CardMemory, retention: number): ScheduleRow {
  return {
    cardId,
    state: memory.state,
    stability: memory.stability,
    difficulty: memory.difficulty,
    dueAt: memory.dueAt.toISOString(),
    lastReviewAt: memory.lastReviewAt === null ? null : memory.lastReviewAt.toISOString(),
    reps: memory.reps,
    lapses: memory.lapses,
    scheduledDays: memory.scheduledDays,
    retentionTarget: retention,
  };
}

// «due»: la fecha del próximo repaso no coincide. «memory»: coincide la fecha pero no otro dato
// de memoria. «missing»: la tarjeta no tiene agenda guardada. «extra»: hay una agenda guardada
// de una tarjeta que no existe.
type DifferenceKind = 'due' | 'memory' | 'missing' | 'extra';

export interface Difference {
  readonly cardId: string;
  readonly kind: DifferenceKind;
  readonly storedDueAt: string | null;
  readonly expectedDueAt: string | null;
}

const MEMORY_FIELDS = [
  'state',
  'stability',
  'difficulty',
  'lastReviewAt',
  'reps',
  'lapses',
  'scheduledDays',
  'retentionTarget',
] as const;

export function compareSchedules(
  stored: readonly ScheduleRow[],
  expected: readonly ScheduleRow[],
): Difference[] {
  const storedById = new Map(stored.map((row) => [row.cardId, row]));
  const differences: Difference[] = [];
  for (const row of expected) {
    const saved = storedById.get(row.cardId);
    storedById.delete(row.cardId);
    if (saved === undefined) {
      differences.push({
        cardId: row.cardId,
        kind: 'missing',
        storedDueAt: null,
        expectedDueAt: row.dueAt,
      });
    } else if (saved.dueAt !== row.dueAt) {
      differences.push({
        cardId: row.cardId,
        kind: 'due',
        storedDueAt: saved.dueAt,
        expectedDueAt: row.dueAt,
      });
    } else if (MEMORY_FIELDS.some((field) => saved[field] !== row[field])) {
      differences.push({
        cardId: row.cardId,
        kind: 'memory',
        storedDueAt: saved.dueAt,
        expectedDueAt: row.dueAt,
      });
    }
  }
  for (const extra of storedById.values()) {
    differences.push({
      cardId: extra.cardId,
      kind: 'extra',
      storedDueAt: extra.dueAt,
      expectedDueAt: null,
    });
  }
  return differences;
}
