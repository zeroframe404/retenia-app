import { describe, expect, it } from 'vitest';
import {
  addToEstimate,
  estimateBacking,
  estimateCounts,
  estimateMean,
  INITIAL_ESTIMATE,
  type MasteryEvent,
  type MasteryResult,
  type MasteryState,
  nextStepOf,
  projectMastery,
} from '../../src/core/mastery';

declare module 'vitest' {
  interface TaskMeta {
    // Una fila de la tabla de casos, para que el tablero muestre lo esperado y lo obtenido.
    tableCase?: { table: string; input: string; expected: string; actual: string };
  }
}

// La máquina de estados de dominio (Fase 17, H-34) y la estimación interna de un concepto
// (CA-156): reglas puras, con fechas de días de estudio. Todos los casos van al tablero como
// «Tabla de casos de dominio».

const TABLE = 'Tabla de casos de dominio';

const STATE_NAMES: Record<MasteryState, string> = {
  'not-started': 'Sin iniciar',
  'in-practice': 'En práctica',
  'to-review': 'A revisar',
  enough: 'Suficiente para avanzar',
  consolidated: 'Consolidado',
};

type Step =
  | readonly [day: string, what: 'sin ayuda' | 'orientadora' | 'pista' | 'paso' | 'opciones']
  | readonly [day: string, what: 'fallo' | 'vas bien' | 'solución' | 'sin evaluar' | 'ya lo sé'];

// «15/03» → el día de estudio 2027-03-15 (los casos son todos de 2027).
const dayOf = (text: string) => {
  const [dd, mm] = text.split('/');
  return `2027-${mm}-${dd}`;
};

function eventsOf(steps: readonly Step[]): MasteryEvent[] {
  return steps.map(([day, what], index) => {
    const base = { id: `e${String(index).padStart(3, '0')}`, seq: index + 1, studyDay: dayOf(day) };
    if (what === 'ya lo sé') {
      return { ...base, kind: 'knowAlready' as const };
    }
    return {
      ...base,
      kind: 'attempt' as const,
      activityId: 'a1',
      verdict:
        what === 'fallo' ? ('incorrect' as const) : what === 'vas bien' ? 'partial' : 'correct',
      helpLevel:
        what === 'orientadora'
          ? ('A1' as const)
          : what === 'pista'
            ? 'A2'
            : what === 'paso'
              ? 'A3'
              : what === 'solución'
                ? 'A4'
                : 'A0',
      optionsQuestion: what === 'opciones',
      valid: what !== 'sin evaluar',
    };
  });
}

const describeSteps = (steps: readonly Step[]) =>
  steps.map(([day, what]) => `${day} ${what}`).join(' · ');

function stateText(result: MasteryResult): string {
  return `${STATE_NAMES[result.state]}${result.toVerify ? ' (por verificar)' : ''}`;
}

const dateOf = (day: string | null) => {
  if (day === null) {
    return '—';
  }
  const [yyyy, mm, dd] = day.split('-');
  return `${dd}/${mm}/${yyyy}`;
};

describe('la tabla de casos de dominio: los estados', () => {
  it.for([
    {
      id: 'CA-144',
      steps: [['15/03', 'sin ayuda']],
      expected: 'En práctica',
    },
    {
      id: 'CA-144',
      steps: [
        ['15/03', 'sin ayuda'],
        ['15/03', 'sin ayuda'],
      ],
      expected: 'En práctica',
    },
    {
      id: 'CA-145',
      steps: [
        ['15/03', 'sin ayuda'],
        ['16/03', 'sin ayuda'],
      ],
      expected: 'Suficiente para avanzar',
    },
    {
      id: 'CA-145',
      steps: [
        ['15/03', 'orientadora'],
        ['16/03', 'sin ayuda'],
      ],
      expected: 'Suficiente para avanzar',
    },
    {
      id: 'CA-146',
      steps: [
        ['15/03', 'sin ayuda'],
        ['16/03', 'sin ayuda'],
        ['23/03', 'sin ayuda'],
      ],
      expected: 'Consolidado',
    },
    {
      id: 'CA-146',
      steps: [
        ['15/03', 'sin ayuda'],
        ['16/03', 'sin ayuda'],
        ['22/03', 'sin ayuda'],
      ],
      expected: 'Suficiente para avanzar',
    },
    {
      id: 'CA-146',
      steps: [
        ['01/03', 'sin ayuda'],
        ['09/03', 'sin ayuda'],
        ['10/03', 'sin ayuda'],
      ],
      expected: 'Consolidado',
    },
    {
      id: 'CA-147',
      steps: [
        ['15/03', 'sin ayuda'],
        ['16/03', 'sin ayuda'],
        ['23/03', 'sin ayuda'],
        ['24/03', 'fallo'],
      ],
      expected: 'A revisar',
    },
    {
      id: 'CA-147',
      steps: [
        ['15/03', 'sin ayuda'],
        ['16/03', 'sin ayuda'],
        ['23/03', 'sin ayuda'],
        ['24/03', 'fallo'],
        ['25/03', 'sin ayuda'],
      ],
      expected: 'Suficiente para avanzar',
    },
    {
      id: 'CA-147',
      steps: [
        ['15/03', 'sin ayuda'],
        ['16/03', 'sin ayuda'],
        ['24/03', 'fallo'],
        ['24/03', 'sin ayuda'],
      ],
      expected: 'A revisar',
    },
    {
      id: 'CA-147',
      steps: [
        ['15/03', 'sin ayuda'],
        ['16/03', 'sin ayuda'],
        ['23/03', 'sin ayuda'],
        ['24/03', 'fallo'],
        ['25/03', 'sin ayuda'],
        ['26/03', 'sin ayuda'],
      ],
      expected: 'Suficiente para avanzar',
    },
    {
      id: 'CA-147',
      steps: [
        ['15/03', 'sin ayuda'],
        ['16/03', 'sin ayuda'],
        ['23/03', 'sin ayuda'],
        ['24/03', 'fallo'],
        ['25/03', 'sin ayuda'],
        ['26/03', 'sin ayuda'],
        ['02/04', 'sin ayuda'],
      ],
      expected: 'Consolidado',
    },
    {
      id: 'CA-147',
      steps: [['15/03', 'fallo']],
      expected: 'En práctica',
    },
    {
      id: 'CA-147',
      steps: [
        ['15/03', 'sin ayuda'],
        ['16/03', 'fallo'],
        ['17/03', 'sin ayuda'],
      ],
      expected: 'Suficiente para avanzar',
    },
    {
      id: 'CA-148',
      steps: [['15/03', 'pista']],
      expected: 'En práctica',
    },
    {
      id: 'CA-148',
      steps: [['15/03', 'opciones']],
      expected: 'En práctica',
    },
    {
      id: 'CA-148',
      steps: [
        ['15/03', 'pista'],
        ['16/03', 'sin ayuda'],
      ],
      expected: 'En práctica',
    },
    {
      id: 'CA-148',
      steps: [
        ['15/03', 'opciones'],
        ['16/03', 'paso'],
        ['17/03', 'sin ayuda'],
      ],
      expected: 'En práctica',
    },
    {
      id: 'CA-148',
      steps: [
        ['15/03', 'sin ayuda'],
        ['16/03', 'solución'],
      ],
      expected: 'En práctica',
    },
    {
      id: 'CA-148',
      steps: [
        ['15/03', 'sin ayuda'],
        ['16/03', 'sin ayuda'],
        ['17/03', 'pista'],
        ['18/03', 'opciones'],
        ['30/03', 'paso'],
      ],
      expected: 'Suficiente para avanzar',
    },
    {
      id: 'CA-144',
      steps: [
        ['15/03', 'sin evaluar'],
        ['16/03', 'sin ayuda'],
      ],
      expected: 'En práctica',
    },
    {
      id: 'CA-144',
      steps: [
        ['15/03', 'vas bien'],
        ['16/03', 'sin ayuda'],
      ],
      expected: 'En práctica',
    },
    {
      id: 'CA-150',
      steps: [['15/03', 'ya lo sé']],
      expected: 'Suficiente para avanzar (por verificar)',
    },
    {
      id: 'CA-150',
      steps: [
        ['15/03', 'ya lo sé'],
        ['16/03', 'fallo'],
      ],
      expected: 'En práctica',
    },
    {
      id: 'CA-150',
      steps: [
        ['15/03', 'ya lo sé'],
        ['16/03', 'sin ayuda'],
      ],
      expected: 'Suficiente para avanzar',
    },
    {
      id: 'CA-150',
      steps: [
        ['15/03', 'ya lo sé'],
        ['15/03', 'sin ayuda'],
      ],
      expected: 'Suficiente para avanzar (por verificar)',
    },
    {
      id: 'CA-150',
      steps: [
        ['15/03', 'ya lo sé'],
        ['16/03', 'pista'],
      ],
      expected: 'Suficiente para avanzar (por verificar)',
    },
    {
      id: 'CA-150',
      steps: [
        ['15/03', 'sin ayuda'],
        ['16/03', 'ya lo sé'],
      ],
      expected: 'En práctica',
    },
  ] satisfies readonly { id: string; steps: readonly Step[]; expected: string }[])(
    '[$id] $expected',
    ({ steps, expected }, { task }) => {
      const actual = stateText(projectMastery(eventsOf(steps)));
      task.meta.tableCase = { table: TABLE, input: describeSteps(steps), expected, actual };
      expect(actual).toBe(expected);
    },
  );

  it('[CA-143] un objetivo sin ningún intento está «Sin iniciar», con las cuatro columnas en cero', ({
    task,
  }) => {
    const result = projectMastery([]);
    const expected = 'Sin iniciar · 0 · 0 · 0 · 0';
    const actual = `${stateText(result)} · ${result.columns.unaided.count} · ${result.columns.aided.count} · ${result.columns.delayed.count} · ${result.columns.variants.count}`;
    task.meta.tableCase = { table: TABLE, input: 'Sin intentos', expected, actual };
    expect(actual).toBe(expected);
  });
});

describe('la tabla de casos de dominio: el panel de evidencias', () => {
  it.for([
    {
      id: 'CA-149',
      // Las pruebas manuales M17.2 a M17.6.
      steps: [
        ['15/03', 'pista'],
        ['16/03', 'sin ayuda'],
        ['17/03', 'sin ayuda'],
        ['24/03', 'sin ayuda'],
        ['25/03', 'fallo'],
      ],
      expected:
        'A revisar · Sin ayuda 3 (24/03/2027) · Con ayuda 1 (15/03/2027) · Diferido 1 (24/03/2027) · Variantes 0 (—)',
    },
    {
      id: 'CA-149',
      steps: [
        ['15/03', 'opciones'],
        ['15/03', 'sin ayuda'],
        ['16/03', 'pista'],
      ],
      expected:
        'En práctica · Sin ayuda 0 (—) · Con ayuda 2 (16/03/2027) · Diferido 0 (—) · Variantes 0 (—)',
    },
    {
      id: 'CA-149',
      steps: [
        ['01/03', 'sin ayuda'],
        ['05/03', 'fallo'],
        ['10/03', 'sin ayuda'],
        ['20/03', 'sin ayuda'],
      ],
      expected:
        'Consolidado · Sin ayuda 3 (20/03/2027) · Con ayuda 0 (—) · Diferido 1 (20/03/2027) · Variantes 0 (—)',
    },
  ] satisfies readonly { id: string; steps: readonly Step[]; expected: string }[])(
    '[$id] las cuatro columnas con conteo y fecha: $expected',
    ({ steps, expected }, { task }) => {
      const result = projectMastery(eventsOf(steps));
      const { unaided, aided, delayed, variants } = result.columns;
      const actual = `${stateText(result)} · Sin ayuda ${unaided.count} (${dateOf(unaided.lastDay)}) · Con ayuda ${aided.count} (${dateOf(aided.lastDay)}) · Diferido ${delayed.count} (${dateOf(delayed.lastDay)}) · Variantes ${variants.count} (${dateOf(variants.lastDay)})`;
      task.meta.tableCase = { table: TABLE, input: describeSteps(steps), expected, actual };
      expect(actual).toBe(expected);
    },
  );
});

describe('qué falta para el próximo estado', () => {
  it('[CA-149] cada estado dice qué falta, con lo que ya hay', () => {
    expect(nextStepOf(projectMastery([]))).toEqual({ kind: 'start' });
    expect(nextStepOf(projectMastery(eventsOf([['15/03', 'pista']])))).toEqual({
      kind: 'toEnough',
      remaining: 2,
    });
    expect(nextStepOf(projectMastery(eventsOf([['15/03', 'sin ayuda']])))).toEqual({
      kind: 'toEnough',
      remaining: 1,
    });
    expect(
      nextStepOf(
        projectMastery(
          eventsOf([
            ['15/03', 'sin ayuda'],
            ['16/03', 'sin ayuda'],
          ]),
        ),
      ),
    ).toEqual({ kind: 'toConsolidated', remaining: 1, delayedFrom: '2027-03-23' });
    expect(
      nextStepOf(
        projectMastery(
          eventsOf([
            ['01/03', 'sin ayuda'],
            ['09/03', 'sin ayuda'],
          ]),
        ),
      ),
    ).toEqual({ kind: 'toConsolidated', remaining: 1, delayedFrom: null });
    expect(
      nextStepOf(
        projectMastery(
          eventsOf([
            ['15/03', 'sin ayuda'],
            ['16/03', 'sin ayuda'],
            ['23/03', 'sin ayuda'],
            ['24/03', 'fallo'],
          ]),
        ),
      ),
    ).toEqual({ kind: 'recover' });
    expect(nextStepOf(projectMastery(eventsOf([['15/03', 'ya lo sé']])))).toEqual({
      kind: 'check',
      from: '2027-03-16',
    });
    expect(
      nextStepOf(
        projectMastery(
          eventsOf([
            ['15/03', 'sin ayuda'],
            ['16/03', 'sin ayuda'],
            ['23/03', 'sin ayuda'],
          ]),
        ),
      ),
    ).toEqual({ kind: 'kept' });
  });

  it('[CA-147] después de «A revisar», volver a «Consolidado» pide tres aciertos desde el fallo, uno con demora', () => {
    const back = projectMastery(
      eventsOf([
        ['15/03', 'sin ayuda'],
        ['16/03', 'sin ayuda'],
        ['23/03', 'sin ayuda'],
        ['24/03', 'fallo'],
        ['25/03', 'sin ayuda'],
      ]),
    );
    expect(nextStepOf(back)).toEqual({
      kind: 'toConsolidated',
      remaining: 2,
      delayedFrom: '2027-04-01',
    });
  });

  it('[CA-150] la comprobación de «Ya lo sé» queda pendiente desde el día siguiente', () => {
    const declared = projectMastery(eventsOf([['15/03', 'ya lo sé']]));
    expect(declared.pendingCheckFrom).toBe('2027-03-16');
    const passed = projectMastery(
      eventsOf([
        ['15/03', 'ya lo sé'],
        ['16/03', 'sin ayuda'],
      ]),
    );
    expect(passed.pendingCheckFrom).toBeNull();
    const failed = projectMastery(
      eventsOf([
        ['15/03', 'ya lo sé'],
        ['16/03', 'fallo'],
      ]),
    );
    expect(failed.pendingCheckFrom).toBeNull();
  });
});

describe('qué intentos cuentan', () => {
  it('[CA-144] solo cuenta el primer intento del día: los demás quedan anotados como del mismo día', () => {
    const result = projectMastery(
      eventsOf([
        ['15/03', 'fallo'],
        ['15/03', 'sin ayuda'],
        ['16/03', 'sin ayuda'],
      ]),
    );
    expect(result.steps.map((step) => step.counted)).toEqual([true, false, true]);
    expect(result.steps[1]?.reason).toBe('sameDay');
    expect(result.columns.unaided.count).toBe(1);
  });

  it('[CA-144] un intento sin evaluar, anulado o afectado no cuenta para nada', () => {
    const result = projectMastery(
      eventsOf([
        ['15/03', 'sin evaluar'],
        ['15/03', 'sin ayuda'],
      ]),
    );
    expect(result.steps.map((step) => [step.counted, step.reason])).toEqual([
      [false, 'notValid'],
      [true, 'counted'],
    ]);
  });

  it('[CA-150] «Ya lo sé» solo vale desde «Sin iniciar»', () => {
    const result = projectMastery(
      eventsOf([
        ['15/03', 'fallo'],
        ['16/03', 'ya lo sé'],
      ]),
    );
    expect(result.steps[1]?.reason).toBe('notApplicable');
    expect(result.toVerify).toBe(false);
  });

  it('[CA-147] un día anterior al último que contó (reloj atrasado) no cuenta', () => {
    const result = projectMastery([
      {
        kind: 'attempt',
        id: 'a',
        seq: 1,
        studyDay: '2027-03-16',
        activityId: 'x',
        verdict: 'correct',
        helpLevel: 'A0',
        optionsQuestion: false,
        valid: true,
      },
      {
        kind: 'attempt',
        id: 'b',
        seq: 2,
        studyDay: '2027-03-15',
        activityId: 'x',
        verdict: 'incorrect',
        helpLevel: 'A0',
        optionsQuestion: false,
        valid: true,
      },
    ]);
    expect(result.steps[1]?.reason).toBe('earlier');
    expect(result.state).toBe('in-practice');
  });
});

const numbers = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });
const fmt = (value: number) => numbers.format(value);

describe('la tabla de casos de dominio: la estimación de un concepto', () => {
  it('[CA-156] parte de 1 y 1; un acierto sin ayuda la deja en 2 y 1', ({ task }) => {
    const after = addToEstimate(INITIAL_ESTIMATE, {
      outcome: 'success',
      helpLevel: 'A0',
      optionsQuestion: false,
      valid: true,
    });
    const { inFavor, against } = estimateCounts(after);
    const expected = '2 y 1';
    const actual = `${fmt(inFavor)} y ${fmt(against)}`;
    task.meta.tableCase = {
      table: TABLE,
      input: 'Estimación 1 y 1 + acierto sin ayuda',
      expected,
      actual,
    };
    expect(actual).toBe(expected);
  });

  it('[CA-156] partiendo de 2 y 2, un acierto con pista suma 0,3 y la media pasa a 0,535', ({
    task,
  }) => {
    let estimate = INITIAL_ESTIMATE;
    for (const outcome of ['success', 'failure'] as const) {
      estimate = addToEstimate(estimate, {
        outcome,
        helpLevel: 'A0',
        optionsQuestion: false,
        valid: true,
      });
    }
    expect(estimateCounts(estimate)).toEqual({ inFavor: 2, against: 2 });
    const after = addToEstimate(estimate, {
      outcome: 'success',
      helpLevel: 'A2',
      optionsQuestion: false,
      valid: true,
    });
    const { inFavor, against } = estimateCounts(after);
    const expected = '2,3 y 2 · media 0,535';
    const actual = `${fmt(inFavor)} y ${fmt(against)} · media ${fmt(estimateMean(after))}`;
    task.meta.tableCase = {
      table: TABLE,
      input: 'Estimación 2 y 2 + acierto con pista de concepto',
      expected,
      actual,
    };
    expect(actual).toBe(expected);
  });

  it('[CA-156] después de ver la solución no cambia', ({ task }) => {
    const start = addToEstimate(INITIAL_ESTIMATE, {
      outcome: 'success',
      helpLevel: 'A0',
      optionsQuestion: false,
      valid: true,
    });
    const after = addToEstimate(start, {
      outcome: 'success',
      helpLevel: 'A4',
      optionsQuestion: false,
      valid: true,
    });
    const { inFavor, against } = estimateCounts(after);
    const expected = '2 y 1';
    const actual = `${fmt(inFavor)} y ${fmt(against)}`;
    task.meta.tableCase = {
      table: TABLE,
      input: 'Estimación 2 y 1 + acierto con la solución vista',
      expected,
      actual,
    };
    expect(actual).toBe(expected);
    expect(after).toEqual(start);
  });

  it('[CA-156] los pesos: 1 sin ayuda (también con la orientadora), 0,3 con pista o con opciones, 0 sin evaluar; un fallo suma en contra y un «Vas bien.» la mitad a cada lado', () => {
    const add = (
      outcome: 'success' | 'partial' | 'failure',
      helpLevel: 'A0' | 'A1' | 'A2' | 'A3' | 'A4',
      optionsQuestion = false,
      valid = true,
    ) =>
      estimateCounts(
        addToEstimate(INITIAL_ESTIMATE, { outcome, helpLevel, optionsQuestion, valid }),
      );
    expect(add('success', 'A1')).toEqual({ inFavor: 2, against: 1 });
    expect(add('success', 'A3')).toEqual({ inFavor: 1.3, against: 1 });
    expect(add('success', 'A0', true)).toEqual({ inFavor: 1.3, against: 1 });
    expect(add('failure', 'A0')).toEqual({ inFavor: 1, against: 2 });
    expect(add('failure', 'A2')).toEqual({ inFavor: 1, against: 1.3 });
    expect(add('failure', 'A4')).toEqual({ inFavor: 1, against: 1 });
    expect(add('partial', 'A0')).toEqual({ inFavor: 1.5, against: 1.5 });
    expect(add('success', 'A0', false, false)).toEqual({ inFavor: 1, against: 1 });
  });

  it('[CA-156] se muestra con su respaldo: «unos N de cada 10» y cuántas observaciones; sin observaciones, nada', () => {
    expect(estimateBacking(INITIAL_ESTIMATE)).toEqual({ outOfTen: null, observations: 0 });
    let estimate = INITIAL_ESTIMATE;
    for (const outcome of ['success', 'success', 'success', 'failure'] as const) {
      estimate = addToEstimate(estimate, {
        outcome,
        helpLevel: 'A0',
        optionsQuestion: false,
        valid: true,
      });
    }
    // 4 a favor y 2 en contra: 0,667 → unos 7 de cada 10.
    expect(estimateBacking(estimate)).toEqual({ outOfTen: 7, observations: 4 });
    const zero = addToEstimate(INITIAL_ESTIMATE, {
      outcome: 'success',
      helpLevel: 'A4',
      optionsQuestion: false,
      valid: true,
    });
    expect(estimateBacking(zero).observations).toBe(0);
  });
});
