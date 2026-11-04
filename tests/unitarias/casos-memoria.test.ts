import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MEMORY_ENGINE_VERSION,
  type MemoryEvent,
  projectCardMemory,
  retentionForSubject,
} from '../../src/core/memory';
import { studyDayOf } from '../../src/core/study-day';
import {
  addDays,
  CASE_START_DAY,
  casesFile,
  computeCase,
  formatDay,
  parseSequence,
  readCases,
  type Sequence,
  UNREVIEWED,
  type When,
} from '../../tools/lib/casos-memoria.mjs';
import { ROOT } from '../../tools/lib/proceso.mjs';

// La tabla de casos congelada (docs/especificacion/casos-memoria.md): cada renglón se corre con el
// motor de Retenia y tiene que dar exactamente las fechas que se congelaron con la biblioteca. El
// tablero la muestra como «Tabla de casos del motor», con lo esperado y lo obtenido.

declare module 'vitest' {
  interface TaskMeta {
    tableCase?: { table: string; input: string; expected: string; actual: string };
  }
}

const TABLE = 'Tabla de casos del motor';
const CARD = '01969f1e-0000-7000-8000-00000000ca5e';
const rows = readCases(readFileSync(casesFile(ROOT), 'utf8'));

const at = (day: string) => new Date(`${day}T10:00:00-03:00`);
const four = (n: number) => n.toFixed(4).replace('.', ',');

// La misma secuencia, con el motor de Retenia: «en su fecha» es la fecha que dice el motor en ese
// momento, así que si el motor se equivoca en un paso, los pasos siguientes caen en otros días.
function runWithEngine(sequence: Sequence) {
  const retention = retentionForSubject(sequence.maintenance ? 'maintenance' : 'active');
  const events: MemoryEvent[] = [];
  const project = () =>
    projectCardMemory(
      { cardId: CARD, createdAt: at(CASE_START_DAY), events },
      { retention },
      MEMORY_ENGINE_VERSION,
    );
  const due: string[] = [];
  let lastEventDay = CASE_START_DAY;
  let reviewed = false;
  let seq = 0;
  for (const step of sequence.steps) {
    const memory = project();
    const dueNow = memory.lastReviewAt === null ? lastEventDay : studyDayOf(memory.dueAt);
    const dayOf = (when: When | null): string => {
      if (when === null) {
        return reviewed ? dueNow : CASE_START_DAY;
      }
      switch (when.kind) {
        case 'date':
          return when.day;
        case 'due':
          return dueNow;
        case 'sameDay':
          return lastEventDay;
        case 'late':
          return addDays(dueNow, when.days);
        case 'early':
          return addDays(dueNow, -when.days);
      }
    };
    seq += 1;
    if (step.kind === 'undo') {
      const annulled = new Set(
        events.flatMap((event) => (event.kind === 'annulled' ? [event.reviewId] : [])),
      );
      const last = [...events]
        .reverse()
        .find((event) => event.kind === 'review' && !annulled.has(event.id));
      if (!last) {
        throw new Error('«deshacer» sin repaso');
      }
      events.push({ kind: 'annulled', id: `a${seq}`, seq, reviewId: last.id });
    } else if (step.kind === 'reset') {
      const day = dayOf(step.when ?? { kind: 'sameDay' });
      events.push({ kind: 'reset', id: `c${seq}`, seq, occurredAt: at(day) });
      lastEventDay = day;
    } else {
      const day = dayOf(step.when);
      events.push(
        step.kind === 'interrupted'
          ? {
              kind: 'review',
              id: `r${seq}`,
              seq,
              occurredAt: at(day),
              grade: 'again',
              interrupted: true,
            }
          : {
              kind: 'review',
              id: `r${seq}`,
              seq,
              occurredAt: at(day),
              grade: step.grade,
              helpLevel: step.help,
              defective: step.defective,
            },
      );
      lastEventDay = day;
      reviewed = true;
    }
    const after = project();
    due.push(after.lastReviewAt === null ? UNREVIEWED : formatDay(studyDayOf(after.dueAt)));
  }
  const final = project();
  return {
    due,
    memory:
      final.lastReviewAt === null
        ? 'nueva'
        : `${four(final.stability)} · ${four(final.difficulty)}`,
  };
}

describe('tabla de casos del motor de memoria', () => {
  it('tiene al menos 40 casos, numerados sin saltos y cada uno con una fecha por paso', () => {
    expect(rows.length).toBeGreaterThanOrEqual(40);
    expect(rows.map((row) => row.id)).toEqual(
      rows.map((_, index) => `C${String(index + 1).padStart(2, '0')}`),
    );
    for (const row of rows) {
      expect(row.expected, row.id).toHaveLength(parseSequence(row.sequence).steps.length);
    }
  });

  it('[CA-059] cubre los primeros repasos con cada botón, aciertos seguidos, fallos tras aciertos, tardíos de 1, 5 y 30 días, mantenimiento, ayuda y anulación', () => {
    const text = rows.map((row) => row.sequence).join('\n');
    for (const pattern of [
      /^tarjeta nueva, La sabía el 15\/03\/2027$/m,
      /^tarjeta nueva, Con dudas el 15\/03\/2027$/m,
      /^tarjeta nueva, No la sabía el 15\/03\/2027$/m,
      /La sabía en su fecha, La sabía en su fecha, La sabía en su fecha/,
      /La sabía en su fecha, No la sabía en su fecha/,
      /1 día tarde/,
      /5 días tarde/,
      /30 días tarde/,
      /materia en mantenimiento/,
      /con pista de concepto/,
      /con la solución vista/,
      /deshacer/,
    ]) {
      expect(text, String(pattern)).toMatch(pattern);
    }
  });

  it('[CA-059] los tres primeros renglones son los de CA-058: 17/03/2027, 16/03/2027 y 16/03/2027', () => {
    expect(rows.slice(0, 3).map((row) => [row.sequence, row.expected])).toEqual([
      ['tarjeta nueva, La sabía el 15/03/2027', ['17/03/2027']],
      ['tarjeta nueva, Con dudas el 15/03/2027', ['16/03/2027']],
      ['tarjeta nueva, No la sabía el 15/03/2027', ['16/03/2027']],
    ]);
  });

  it('[CA-059] tres «La sabía» seguidos en su fecha: cada intervalo es más largo que el anterior', () => {
    const row = rows.find(
      (r) =>
        r.sequence ===
        'tarjeta nueva, La sabía el 15/03/2027, La sabía en su fecha, La sabía en su fecha',
    );
    expect(row?.expected).toEqual(['17/03/2027', '28/03/2027', '13/05/2027']);
    const days = ['15/03/2027', ...(row?.expected ?? [])].map((d) =>
      Date.parse(d.split('/').reverse().join('-')),
    );
    const intervals = days.slice(1).map((day, index) => (day - (days[index] ?? 0)) / 86_400_000);
    expect(intervals).toEqual([2, 11, 46]);
  });

  it('[CA-059] cada renglón congelado coincide con la biblioteca y con la fórmula publicada de FSRS-6', () => {
    for (const row of rows) {
      expect(computeCase(row.sequence), row.id).toEqual({
        expected: row.expected,
        memory: row.memory,
      });
    }
  });

  it.for(rows)('[CA-059] tabla de casos del motor, $id: $sequence', (row, { task }) => {
    // El renglón del tablero existe aunque el motor falle: así un caso roto nunca desaparece de la
    // tabla ni del «N casos · N iguales».
    const shown = {
      table: TABLE,
      input: `${row.id} · ${row.sequence}`,
      expected: row.expected.join(' · '),
    };
    task.meta.tableCase = { ...shown, actual: 'el motor no pudo calcularlo' };
    const obtained = runWithEngine(parseSequence(row.sequence));
    // Si coinciden las fechas pero no la memoria, «Obtenido» lo dice.
    task.meta.tableCase = {
      ...shown,
      actual:
        obtained.memory === row.memory
          ? obtained.due.join(' · ')
          : `${obtained.due.join(' · ')} (estabilidad · dificultad ${obtained.memory}; se esperaba ${row.memory})`,
    };
    expect(obtained.due).toEqual(row.expected);
    expect(obtained.memory).toBe(row.memory);
  });
});
