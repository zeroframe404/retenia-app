import { describe, expect, it } from 'vitest';
import { type Activity, evaluateDecision, validateActivity } from '../../src/core/evaluation';
import { conceptPair, type MasteryEvent, nextStepOf, projectMastery } from '../../src/core/mastery';

// Fase 18: en «Aplicar», «Consolidado» pide además un acierto sin ayuda en una variante nueva
// (CA-165); la actividad «decisión» (CA-161) y los conceptos de una tarjeta de contraste (CA-163).

declare module 'vitest' {
  interface TaskMeta {
    tableCase?: { table: string; input: string; expected: string; actual: string };
  }
}

const TABLE = 'Tabla de casos de dominio';

const attempt = (n: number, day: number, newVariant = false): MasteryEvent => ({
  kind: 'attempt',
  id: `a${n}`,
  seq: n,
  studyDay: `2027-03-${String(day).padStart(2, '0')}`,
  activityId: 'x',
  verdict: 'correct',
  helpLevel: 'A0',
  optionsQuestion: false,
  valid: true,
  newVariant,
});

// 3 aciertos sin ayuda en días distintos, el último con 7 días de demora.
const THREE = [attempt(1, 15), attempt(2, 16), attempt(3, 23)];

describe('«Consolidado» en objetivos de tipo «Aplicar»', () => {
  it('[CA-165] sin un acierto en una variante nueva queda en «Suficiente para avanzar»', ({
    task,
  }) => {
    const result = projectMastery(THREE, { needsVariant: true });
    task.meta.tableCase = {
      table: TABLE,
      input: '«Aplicar»: 15/03, 16/03 y 23/03 sin ayuda, sin variante nueva',
      expected: 'Suficiente para avanzar',
      actual: result.state === 'enough' ? 'Suficiente para avanzar' : result.state,
    };
    expect(result.state).toBe('enough');
    expect(result.columns.variants).toEqual({ count: 0, lastDay: null });
    expect(nextStepOf(result)).toEqual({
      kind: 'toConsolidated',
      remaining: 0,
      delayedFrom: null,
      needsVariant: true,
    });
  });

  it('[CA-165] con el acierto sin ayuda en una variante nueva queda «Consolidado» y figura en la columna «Variantes»', ({
    task,
  }) => {
    const result = projectMastery([...THREE, attempt(4, 24, true)], { needsVariant: true });
    task.meta.tableCase = {
      table: TABLE,
      input: '«Aplicar»: lo de antes y el 24/03 una variante nueva sin ayuda',
      expected: 'Consolidado',
      actual: result.state === 'consolidated' ? 'Consolidado' : result.state,
    };
    expect(result.state).toBe('consolidated');
    expect(result.columns.variants).toEqual({ count: 1, lastDay: '2027-03-24' });
  });

  it('[CA-165] la variante nueva puede ser uno de los 3 aciertos', () => {
    const result = projectMastery([attempt(1, 15), attempt(2, 16, true), attempt(3, 23)], {
      needsVariant: true,
    });
    expect(result.state).toBe('consolidated');
    expect(result.columns.variants.count).toBe(1);
  });

  it('[CA-165] una variante nueva con ayuda, con opciones o repetida el mismo día no cuenta', () => {
    for (const extra of [
      { ...attempt(4, 24, true), helpLevel: 'A3' as const },
      { ...attempt(4, 24, true), optionsQuestion: true },
      attempt(4, 23, true),
    ]) {
      const result = projectMastery([...THREE, extra as MasteryEvent], { needsVariant: true });
      expect(result.state).toBe('enough');
      expect(result.columns.variants.count).toBe(0);
    }
  });

  it('[CA-165] después de un fallo, «Consolidado» pide una variante nueva otra vez', () => {
    const fail: MasteryEvent = {
      ...(attempt(5, 25) as Extract<MasteryEvent, { kind: 'attempt' }>),
      verdict: 'incorrect',
    };
    const again = [attempt(6, 26), attempt(7, 27), attempt(8, 28), attempt(9, 31)];
    const before = [...THREE, attempt(4, 24, true), fail];
    const result = projectMastery(
      [...before, ...again, { ...attempt(10, 31), studyDay: '2027-04-08' } as MasteryEvent],
      { needsVariant: true },
    );
    expect(result.state).toBe('enough');
  });

  it('en los demás tipos no hace falta variante', () => {
    expect(projectMastery(THREE).state).toBe('consolidated');
    expect(projectMastery(THREE, { needsVariant: false }).state).toBe('consolidated');
  });
});

const DECISION: Activity = {
  type: 'decision',
  options: [
    {
      id: 'media',
      text: 'La media',
      correct: false,
      explanation: 'El sueldo extremo la arrastra.',
    },
    { id: 'mediana', text: 'La mediana', correct: true, explanation: 'No la mueve un extremo.' },
    { id: 'moda', text: 'La moda', correct: false, explanation: 'Casi no hay sueldos repetidos.' },
  ],
};

describe('la actividad «decisión»', () => {
  it('[CA-161] elegir el método correcto es «Correcto.» y otro, «Todavía no.», con el porqué de cada opción', () => {
    expect(
      evaluateDecision('mediana', DECISION.type === 'decision' ? DECISION.options : []),
    ).toEqual({ verdict: 'correct', explanation: 'No la mueve un extremo.' });
    expect(evaluateDecision('media', DECISION.type === 'decision' ? DECISION.options : [])).toEqual(
      {
        verdict: 'incorrect',
        explanation: 'El sueldo extremo la arrastra.',
      },
    );
  });

  it('[CA-161] pide de 2 a 5 métodos distintos, uno solo correcto y el porqué de cada uno', () => {
    if (DECISION.type !== 'decision') {
      return;
    }
    expect(validateActivity(DECISION)).toEqual([]);
    expect(validateActivity({ ...DECISION, options: DECISION.options.slice(0, 1) })).not.toEqual(
      [],
    );
    expect(
      validateActivity({
        ...DECISION,
        options: DECISION.options.map((option) => ({ ...option, correct: false })),
      }),
    ).not.toEqual([]);
    expect(
      validateActivity({
        ...DECISION,
        options: DECISION.options.map((option, n) =>
          n === 0 ? { ...option, explanation: '  ' } : option,
        ),
      }),
    ).not.toEqual([]);
  });
});

describe('los conceptos de una tarjeta de contraste', () => {
  it('[CA-163] de dos respuestas cortas salen los conceptos en minúscula: «la media» y «la mediana»', () => {
    expect(conceptPair('La media', 'La mediana')).toEqual(['la media', 'la mediana']);
    expect(conceptPair('El desvío estándar.', 'la varianza')).toEqual([
      'el desvío estándar',
      'la varianza',
    ]);
    expect(conceptPair('Moda', 'Mediana')).toEqual(['Moda', 'Mediana']);
  });

  it('[CA-163] si no son dos conceptos cortos y distintos, no se adivinan', () => {
    expect(conceptPair('La media', 'la  MEDIA')).toBeNull();
    expect(conceptPair('', 'La mediana')).toBeNull();
    expect(
      conceptPair(
        'El promedio de los cuadrados de las distancias de cada dato a la media de la muestra',
        'La mediana',
      ),
    ).toBeNull();
  });
});
