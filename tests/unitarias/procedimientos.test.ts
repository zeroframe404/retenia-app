import { describe, expect, it } from 'vitest';
import {
  blankStepIds,
  checkStep,
  failedStepOf,
  type LadderEvent,
  type Procedure,
  procedureHelpLevel,
  procedureVerdict,
  projectLadder,
  resolveSteps,
  rungsOf,
  validateProcedure,
} from '../../src/core/procedure';

declare module 'vitest' {
  interface TaskMeta {
    // Una fila de la tabla de casos, para que el tablero muestre lo esperado y lo obtenido.
    tableCase?: { table: string; input: string; expected: string; actual: string };
  }
}

// La escalera de apoyo y la corrección por pasos (Fase 18, H-37). La escalera sale de las reglas:
// todos los casos van al tablero como «Tabla de casos de la escalera de apoyo».

const TABLE = 'Tabla de casos de la escalera de apoyo';

// El procedimiento del elenco: 4 pasos, el primero es el paso clave.
const PROCEDURE: Procedure = {
  type: 'procedure',
  steps: [
    {
      id: 'error',
      prompt: 'Calculá el error estándar de la media.',
      expected: { type: 'number', formula: 's / raiz(n)', tolerance: 0.01, unit: null },
      explanation: 'El error estándar es {s} ÷ raíz de {n}.',
      key: true,
    },
    {
      id: 'z',
      prompt: 'Elegí el valor crítico z para una confianza del 95 %.',
      expected: { type: 'number', formula: '1,96', tolerance: 0.005, unit: null },
      explanation: 'Para el 95 %, z es 1,96.',
      key: false,
    },
    {
      id: 'margen',
      prompt: 'Calculá el margen de error.',
      expected: { type: 'number', formula: 'paso2 * paso1', tolerance: 0.05, unit: null },
      explanation: 'El margen es z por el error estándar.',
      key: false,
    },
    {
      id: 'limite',
      prompt: 'Escribí el límite superior del intervalo.',
      expected: { type: 'number', formula: 'media + paso3', tolerance: 0.05, unit: null },
      explanation: 'El límite superior es la media más el margen.',
      key: false,
    },
  ],
  family: {
    statements: ['Muestra de {n} datos, media {media}, desvío {s}.'],
    parameters: [
      { name: 'media', values: [50, 60] },
      { name: 'n', values: [16, 25] },
      { name: 'ee', values: [1, 2] },
    ],
    derived: [{ name: 's', formula: 'ee * raiz(n)' }],
  },
};

const day = (n: number) => `2027-03-${String(n).padStart(2, '0')}`;

type Short = ['visto', number] | ['bien', number] | ['conPista', number] | ['mal', number, string];

function history(items: readonly Short[]): LadderEvent[] {
  return items.map((item, index) => {
    const base = { id: `e${index}`, seq: index + 1, studyDay: day(item[1]) };
    if (item[0] === 'visto') {
      return { ...base, kind: 'studied' as const };
    }
    return {
      ...base,
      kind: 'attempt' as const,
      failedStep: item[0] === 'mal' ? item[2] : null,
      aided: item[0] === 'conPista',
    };
  });
}

const RUNG_NAMES = [
  'ejemplo completo',
  'último paso vacío',
  'dos últimos vacíos',
  'tres últimos vacíos',
  'problema entero',
  'variante',
];

const nameOf = (level: number) => RUNG_NAMES[level] ?? String(level);

const describeHistory = (items: readonly Short[]) =>
  items.length === 0
    ? 'sin historial'
    : items
        .map((item) =>
          item[0] === 'mal'
            ? `${item[1]}/03 mal el paso «${item[2]}»`
            : `${item[1]}/03 ${item[0] === 'visto' ? 'ejemplo visto' : item[0] === 'bien' ? 'bien sin ayuda' : 'bien con pista'}`,
        )
        .join(' · ');

// Cuántos aciertos hacen falta para llegar a cada escalón desde el ejemplo.
const UP_TO_ONE: Short[] = [
  ['visto', 15],
  ['visto', 16],
];

interface Case {
  readonly criterion: string;
  readonly name: string;
  readonly items: readonly Short[];
  readonly level: number;
}

const CASES: readonly Case[] = [
  { criterion: 'CA-157', name: 'la primera vez, el ejemplo completo', items: [], level: 0 },
  {
    criterion: 'CA-158',
    name: 'con un solo día no se retira el apoyo',
    items: [['visto', 15]],
    level: 0,
  },
  {
    criterion: 'CA-158',
    name: 'dos veces el mismo día cuentan una sola',
    items: [
      ['visto', 15],
      ['visto', 15],
    ],
    level: 0,
  },
  {
    criterion: 'CA-158',
    name: 'bien en dos días distintos: el último paso vacío',
    items: UP_TO_ONE,
    level: 1,
  },
  {
    criterion: 'CA-158',
    name: 'otros dos días bien: los dos últimos vacíos',
    items: [...UP_TO_ONE, ['bien', 17], ['bien', 18]],
    level: 2,
  },
  {
    criterion: 'CA-158',
    name: 'otros dos días bien: los tres últimos vacíos',
    items: [...UP_TO_ONE, ['bien', 17], ['bien', 18], ['bien', 19], ['bien', 20]],
    level: 3,
  },
  {
    criterion: 'CA-158',
    name: 'después, el problema entero',
    items: [
      ...UP_TO_ONE,
      ['bien', 17],
      ['bien', 18],
      ['bien', 19],
      ['bien', 20],
      ['bien', 21],
      ['bien', 22],
    ],
    level: 4,
  },
  {
    criterion: 'CA-158',
    name: 'y al final la variante, de donde no se pasa',
    items: [
      ...UP_TO_ONE,
      ['bien', 17],
      ['bien', 18],
      ['bien', 19],
      ['bien', 20],
      ['bien', 21],
      ['bien', 22],
      ['bien', 23],
      ['bien', 24],
      ['bien', 25],
      ['bien', 26],
    ],
    level: 5,
  },
  {
    criterion: 'CA-159',
    name: 'un fallo aislado repite el escalón',
    items: [...UP_TO_ONE, ['mal', 17, 'limite']],
    level: 1,
  },
  {
    criterion: 'CA-159',
    name: 'dos fallos seguidos del mismo tipo: un paso más de apoyo',
    items: [...UP_TO_ONE, ['mal', 17, 'limite'], ['mal', 18, 'limite']],
    level: 0,
  },
  {
    criterion: 'CA-159',
    name: 'dos fallos seguidos de tipo distinto no cambian nada',
    items: [...UP_TO_ONE, ['mal', 17, 'limite'], ['mal', 18, 'margen']],
    level: 1,
  },
  {
    criterion: 'CA-159',
    name: 'un acierto entre dos fallos corta la racha de fallos',
    items: [...UP_TO_ONE, ['mal', 17, 'limite'], ['bien', 18], ['mal', 19, 'limite']],
    level: 1,
  },
  {
    criterion: 'CA-159',
    name: 'dos fallos el mismo día cuentan uno: solo el primer intento del día',
    items: [...UP_TO_ONE, ['mal', 17, 'limite'], ['mal', 17, 'limite']],
    level: 1,
  },
  {
    criterion: 'CA-159',
    name: 'un solo cambio por vez: el tercer fallo no vuelve a bajar',
    items: [
      ...UP_TO_ONE,
      ['bien', 17],
      ['bien', 18],
      ['mal', 19, 'limite'],
      ['mal', 20, 'limite'],
      ['mal', 21, 'limite'],
    ],
    level: 1,
  },
  {
    criterion: 'CA-159',
    name: 'el cuarto fallo seguido del mismo tipo sí vuelve a sumar apoyo',
    items: [
      ...UP_TO_ONE,
      ['bien', 17],
      ['bien', 18],
      ['mal', 19, 'limite'],
      ['mal', 20, 'limite'],
      ['mal', 21, 'limite'],
      ['mal', 22, 'limite'],
    ],
    level: 0,
  },
  {
    criterion: 'CA-158',
    name: 'un fallo borra el acierto anterior: hacen falta dos días de nuevo',
    items: [...UP_TO_ONE, ['bien', 17], ['mal', 18, 'limite'], ['bien', 19]],
    level: 1,
  },
  {
    criterion: 'CA-158',
    name: 'un acierto con pista no retira apoyo',
    items: [...UP_TO_ONE, ['bien', 17], ['conPista', 18]],
    level: 1,
  },
  {
    criterion: 'CA-158',
    name: 'un día anterior al último contado (reloj atrasado) no cuenta',
    items: [
      ['visto', 16],
      ['visto', 15],
    ],
    level: 0,
  },
];

describe('la escalera de apoyo', () => {
  it('con 4 pasos: ejemplo, uno, dos y tres vacíos, problema entero y variante; con 3 pasos, cinco escalones', () => {
    expect(rungsOf(4)).toEqual([
      { kind: 'example' },
      { kind: 'blanks', count: 1 },
      { kind: 'blanks', count: 2 },
      { kind: 'blanks', count: 3 },
      { kind: 'whole' },
      { kind: 'variant' },
    ]);
    expect(rungsOf(3)).toHaveLength(5);
  });

  it('[CA-158] cada escalón deja vacíos los últimos pasos: primero el último', () => {
    const ids = ['error', 'z', 'margen', 'limite'];
    expect(blankStepIds({ kind: 'example' }, ids)).toEqual([]);
    expect(blankStepIds({ kind: 'blanks', count: 1 }, ids)).toEqual(['limite']);
    expect(blankStepIds({ kind: 'blanks', count: 2 }, ids)).toEqual(['margen', 'limite']);
    expect(blankStepIds({ kind: 'whole' }, ids)).toEqual(ids);
    expect(blankStepIds({ kind: 'variant' }, ids)).toEqual(ids);
  });

  for (const row of CASES) {
    it(`[${row.criterion}] ${row.name}`, ({ task }) => {
      const result = projectLadder(rungsOf(4).length, history(row.items));
      task.meta.tableCase = {
        table: TABLE,
        input: describeHistory(row.items),
        expected: nameOf(row.level),
        actual: nameOf(result.level),
      };
      expect(result.level).toBe(row.level);
    });
  }

  it('[CA-159] cada evento dice si contó y qué cambió', () => {
    const result = projectLadder(
      6,
      history([...UP_TO_ONE, ['mal', 17, 'z'], ['mal', 17, 'z'], ['mal', 18, 'z']]),
    );
    expect(result.steps.map((step) => [step.counted, step.change, step.level])).toEqual([
      [true, null, 0],
      [true, 'less', 1],
      [true, null, 1],
      [false, null, 1],
      [true, 'more', 0],
    ]);
  });
});

describe('la corrección por pasos', () => {
  const values = { media: 50, n: 16, ee: 2, s: 8 };
  const steps = resolveSteps(PROCEDURE, values);

  it('[CA-164] el resultado de cada paso se calcula con los números de la variante y con los pasos de antes', () => {
    expect(
      steps.map((step) => (step.expected.type === 'number' ? step.expected.value : null)),
    ).toEqual([2, 1.96, 3.92, 53.92]);
    expect(steps[0]?.explanation).toBe('El error estándar es 8 ÷ raíz de 16.');
  });

  it('[CA-160] un paso numérico se compara con su tolerancia, con coma o punto; uno de texto lo compara quien estudia', () => {
    const limit = steps[3] as (typeof steps)[number];
    expect(checkStep(limit, '53,92')).toBe('ok');
    expect(checkStep(limit, '53.95')).toBe('ok');
    expect(checkStep(limit, '54,1')).toBe('wrong');
    expect(checkStep(limit, 'no sé')).toBe('wrong');
    expect(checkStep(limit, '')).toBe('wrong');
    const text = resolveSteps(
      {
        ...PROCEDURE,
        steps: [
          {
            id: 'frase',
            prompt: 'Explicá',
            expected: { type: 'text', text: 'La media de {media}' },
            explanation: '',
            key: false,
          },
        ],
      },
      values,
    )[0];
    expect(text?.expected).toEqual({ type: 'text', text: 'La media de 50' });
    expect(checkStep(text as NonNullable<typeof text>, 'lo que sea')).toBe('self');
  });

  it('[CA-160] el primer paso con error es el que se nombra; corregirlo al reintentar queda en «Vas bien.»', () => {
    expect(failedStepOf(['ok', 'ok', 'wrong', 'wrong'])).toBe(2);
    expect(failedStepOf(['ok', 'fixed', 'ok', 'ok'])).toBe(1);
    expect(failedStepOf(['ok', 'ok', 'ok', 'ok'])).toBeNull();
    expect(procedureVerdict(['ok', 'ok'])).toBe('correct');
    expect(procedureVerdict(['ok', 'fixed'])).toBe('partial');
    expect(procedureVerdict(['fixed', 'wrong'])).toBe('incorrect');
  });

  it('con pasos resueltos a la vista es práctica con ayuda; el problema entero y la variante, sin ayuda', () => {
    expect(procedureHelpLevel({ kind: 'blanks', count: 2 })).toBe('A3');
    expect(procedureHelpLevel({ kind: 'whole' })).toBe('A0');
    expect(procedureHelpLevel({ kind: 'variant' })).toBe('A0');
  });

  it('un procedimiento necesita de 2 a 8 pasos completos, al menos un paso clave y fórmulas que se puedan calcular', () => {
    expect(validateProcedure(PROCEDURE)).toEqual([]);
    expect(validateProcedure({ ...PROCEDURE, steps: PROCEDURE.steps.slice(0, 1) })).toContain(
      'stepCount',
    );
    expect(
      validateProcedure({
        ...PROCEDURE,
        steps: PROCEDURE.steps.map((step) => ({ ...step, key: false })),
      }),
    ).toContain('keyStep');
    expect(
      validateProcedure({
        ...PROCEDURE,
        steps: PROCEDURE.steps.map((step, n) => (n === 0 ? { ...step, explanation: ' ' } : step)),
      }),
    ).toContain('emptyStep');
    // Una fórmula no puede usar un paso que viene después.
    expect(
      validateProcedure({
        ...PROCEDURE,
        steps: PROCEDURE.steps.map((step, n) =>
          n === 0
            ? { ...step, expected: { type: 'number', formula: 'paso4', tolerance: 0, unit: null } }
            : step,
        ),
      }),
    ).toContain('formula');
    // Sin familia, las fórmulas son números fijos o usan pasos de antes.
    expect(validateProcedure({ ...PROCEDURE, family: null })).toContain('formula');
  });
});
