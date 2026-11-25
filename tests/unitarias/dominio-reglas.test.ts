import { describe, expect, it } from 'vitest';
import {
  confusionOf,
  diagnoseFailure,
  foldRequirements,
  frontier,
  type MistakeInput,
  mistakeTypeOf,
  parseObjectiveText,
  type Requirement,
  type RequirementEvent,
  recurringDifficulty,
  wouldCreateCycle,
} from '../../src/core/mastery';

// Las demás reglas puras de la Fase 17: el texto de un objetivo (H-34), los requisitos y la
// frontera (H-35), el diagnóstico tras un fallo, la dificultad recurrente y el tipo de error
// (H-36).

describe('el texto de un objetivo', () => {
  it('[CA-143] «Interpretar un intervalo de confianza»: la acción observable, el contenido y su concepto', () => {
    expect(parseObjectiveText('  Interpretar un intervalo de confianza ')).toEqual({
      title: 'Interpretar un intervalo de confianza',
      action: 'Interpretar',
      content: 'un intervalo de confianza',
      conceptKey: 'intervalo de confianza',
      observable: true,
    });
    expect(parseObjectiveText('Calcular la media y el desvío').conceptKey).toBe(
      'media y el desvio',
    );
  });

  it('[CA-143] «Entender», «Saber» o algo que no empieza con una acción no se pueden observar: se avisa', () => {
    expect(parseObjectiveText('Entender la media').observable).toBe(false);
    expect(parseObjectiveText('Saber la fórmula').observable).toBe(false);
    expect(parseObjectiveText('La media').observable).toBe(false);
    expect(parseObjectiveText('Explicar').observable).toBe(true);
    expect(parseObjectiveText('Explicar').content).toBe('');
  });
});

const added = (
  seq: number,
  requirementId: string,
  objectiveId: string,
  requiresId: string,
  kind: 'indispensable' | 'recommended' = 'indispensable',
  status: 'confirmed' | 'suggested' = 'confirmed',
): RequirementEvent => ({
  kind: 'added',
  id: `ev${seq}`,
  seq,
  requirementId,
  objectiveId,
  requiresId,
  requirementKind: kind,
  status,
});

describe('los requisitos y la frontera', () => {
  it('[CA-151] un requisito indispensable y confirmado cuyo objetivo está debajo de «Suficiente para avanzar» bloquea', () => {
    const requirements = foldRequirements([added(1, 'r1', 'interpretar', 'calcular')]);
    for (const state of ['not-started', 'in-practice', 'to-review'] as const) {
      const result = frontier({
        objectives: [
          { id: 'interpretar', state: 'in-practice', postponed: false },
          { id: 'calcular', state, postponed: false },
        ],
        requirements,
      });
      expect(result.blocked.get('interpretar')?.map((r) => r.requiresId)).toEqual(['calcular']);
      expect(result.available).not.toContain('interpretar');
      expect(result.available).toContain('calcular');
    }
    for (const state of ['enough', 'consolidated'] as const) {
      const result = frontier({
        objectives: [
          { id: 'interpretar', state: 'in-practice', postponed: false },
          { id: 'calcular', state, postponed: false },
        ],
        requirements,
      });
      expect(result.blocked.size).toBe(0);
      expect(result.available).toContain('interpretar');
    }
  });

  it('[CA-152] uno solo sugerido o recomendable nunca bloquea: avisa', () => {
    for (const [kind, status] of [
      ['indispensable', 'suggested'],
      ['recommended', 'confirmed'],
      ['recommended', 'suggested'],
    ] as const) {
      const result = frontier({
        objectives: [
          { id: 'interpretar', state: 'not-started', postponed: false },
          { id: 'calcular', state: 'not-started', postponed: false },
        ],
        requirements: foldRequirements([added(1, 'r1', 'interpretar', 'calcular', kind, status)]),
      });
      expect(result.blocked.size).toBe(0);
      expect(result.warnings.get('interpretar')?.map((r) => r.requiresId)).toEqual(['calcular']);
      expect(result.available).toContain('interpretar');
    }
  });

  it('[CA-152] «Esto no es necesario para aquello» lo saca al instante; «Confirmar» vuelve indispensable uno sugerido', () => {
    const events: RequirementEvent[] = [
      added(1, 'r1', 'interpretar', 'calcular', 'indispensable', 'suggested'),
      { kind: 'confirmed', id: 'ev2', seq: 2, requirementId: 'r1' },
    ];
    const confirmed = foldRequirements(events);
    expect(confirmed).toEqual<Requirement[]>([
      {
        id: 'r1',
        objectiveId: 'interpretar',
        requiresId: 'calcular',
        kind: 'indispensable',
        status: 'confirmed',
        dismissed: false,
        seq: 1,
      },
    ]);
    const dismissed = foldRequirements([
      ...events,
      { kind: 'dismissed', id: 'ev3', seq: 3, requirementId: 'r1' },
    ]);
    expect(dismissed[0]?.dismissed).toBe(true);
    const result = frontier({
      objectives: [
        { id: 'interpretar', state: 'in-practice', postponed: false },
        { id: 'calcular', state: 'not-started', postponed: false },
      ],
      requirements: dismissed,
    });
    expect(result.blocked.size).toBe(0);
    expect(result.warnings.size).toBe(0);
  });

  it('[CA-151] un objetivo pospuesto («No quiero esto ahora») no está en la frontera, pero sigue frenando a lo que lo necesita', () => {
    const result = frontier({
      objectives: [
        { id: 'interpretar', state: 'in-practice', postponed: false },
        { id: 'calcular', state: 'not-started', postponed: true },
      ],
      requirements: foldRequirements([added(1, 'r1', 'interpretar', 'calcular')]),
    });
    expect(result.available).toEqual([]);
    expect(result.blocked.has('interpretar')).toBe(true);
  });

  it('[CA-151] un requisito de un objetivo que no existe (o ya no está) no bloquea', () => {
    const result = frontier({
      objectives: [{ id: 'interpretar', state: 'in-practice', postponed: false }],
      requirements: foldRequirements([added(1, 'r1', 'interpretar', 'perdido')]),
    });
    expect(result.blocked.size).toBe(0);
  });

  it('[CA-151] no se puede armar un círculo de requisitos ni un objetivo que se necesita a sí mismo', () => {
    const requirements = foldRequirements([
      added(1, 'r1', 'a', 'b'),
      added(2, 'r2', 'b', 'c'),
      { kind: 'dismissed', id: 'ev3', seq: 3, requirementId: 'r2' },
      added(4, 'r3', 'b', 'd'),
    ]);
    expect(wouldCreateCycle(requirements, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(requirements, 'b', 'a')).toBe(true);
    expect(wouldCreateCycle(requirements, 'd', 'a')).toBe(true);
    // El descartado no cuenta.
    expect(wouldCreateCycle(requirements, 'c', 'a')).toBe(false);
    expect(wouldCreateCycle(requirements, 'a', 'c')).toBe(false);
    // Dos caminos que llegan al mismo objetivo: se recorre una sola vez.
    const diamond = foldRequirements([
      added(1, 'd1', 'x', 'y'),
      added(2, 'd2', 'x', 'z'),
      added(3, 'd3', 'y', 'w'),
      added(4, 'd4', 'z', 'w'),
    ]);
    expect(wouldCreateCycle(diamond, 'q', 'x')).toBe(false);
    expect(wouldCreateCycle(diamond, 'w', 'x')).toBe(true);
  });

  it('[CA-152] el mismo requisito dos veces queda una sola vez', () => {
    const requirements = foldRequirements([
      added(1, 'r1', 'a', 'b', 'recommended', 'suggested'),
      added(2, 'r2', 'a', 'b', 'indispensable', 'confirmed'),
    ]);
    expect(requirements.filter((r) => !r.dismissed)).toHaveLength(1);
    // Confirmar o descartar uno que no existe no hace nada.
    expect(
      foldRequirements([
        added(1, 'r1', 'a', 'b'),
        { kind: 'dismissed', id: 'ev9', seq: 9, requirementId: 'otro' },
      ]),
    ).toHaveLength(1);
    expect(requirements.find((r) => !r.dismissed)).toMatchObject({
      id: 'r2',
      kind: 'indispensable',
      status: 'confirmed',
    });
  });
});

describe('el diagnóstico tras un fallo', () => {
  const all = {
    previous: { verdict: 'correct' as const, helpLevel: 'A2' as const, optionsQuestion: false },
    doubtful: true,
    missingRequirement: {
      objectiveId: 'calcular',
      title: 'Calcular la media y el desvío',
      state: 'not-started' as const,
    },
    confusedWith: { cardId: 'c2', question: '¿Qué es la mediana?' },
  };

  it('[CA-153] revisa en orden: ayuda o azar en el intento anterior, pregunta dudosa, requisito, confusión y recién al final olvido, con una sola acción y su motivo', () => {
    expect(diagnoseFailure(all)).toEqual({ action: 'checkUnaided', reason: 'previousAided' });
    expect(
      diagnoseFailure({
        ...all,
        previous: { verdict: 'correct', helpLevel: 'A0', optionsQuestion: true },
      }),
    ).toEqual({ action: 'checkUnaided', reason: 'previousOptions' });
    expect(diagnoseFailure({ ...all, previous: null })).toEqual({
      action: 'sendToReview',
      reason: 'doubtful',
    });
    expect(diagnoseFailure({ ...all, previous: null, doubtful: false })).toEqual({
      action: 'goToRequirement',
      reason: 'missingRequirement',
      requirement: all.missingRequirement,
    });
    expect(
      diagnoseFailure({ ...all, previous: null, doubtful: false, missingRequirement: null }),
    ).toEqual({
      action: 'practiceDifference',
      reason: 'confusion',
      confusedWith: all.confusedWith,
    });
    expect(
      diagnoseFailure({
        previous: null,
        doubtful: false,
        missingRequirement: null,
        confusedWith: null,
      }),
    ).toEqual({ action: 'forgotten', reason: 'forgotten' });
  });

  it('[CA-153] un intento anterior sin ayuda (o con la pregunta orientadora) no dispara la comprobación', () => {
    for (const helpLevel of ['A0', 'A1'] as const) {
      expect(
        diagnoseFailure({
          previous: { verdict: 'correct', helpLevel, optionsQuestion: false },
          doubtful: false,
          missingRequirement: null,
          confusedWith: null,
        }).action,
      ).toBe('forgotten');
    }
    expect(
      diagnoseFailure({
        previous: { verdict: 'incorrect', helpLevel: 'A3', optionsQuestion: false },
        doubtful: false,
        missingRequirement: null,
        confusedWith: null,
      }).action,
    ).toBe('checkUnaided');
  });

  it('[CA-153] la confusión: lo que escribiste es la respuesta de otra tarjeta de la materia (sin mayúsculas, tildes ni espacios)', () => {
    const others = [
      {
        cardId: 'c1',
        question: '¿Qué es la media?',
        answers: ['La suma dividida por la cantidad'],
      },
      {
        cardId: 'c2',
        question: '¿Qué mide la mediana?',
        answers: ['El valor del medio', 'Mediana'],
      },
    ];
    expect(confusionOf('mediana', others)).toEqual({
      cardId: 'c2',
      question: '¿Qué mide la mediana?',
    });
    expect(confusionOf('el valor del MEDIO', others)?.cardId).toBe('c2');
    expect(confusionOf('cualquier cosa', others)).toBeNull();
    expect(confusionOf('   ', others)).toBeNull();
  });
});

describe('la dificultad recurrente', () => {
  it('[CA-154] 4 fallos en total (desde la última mejora) la sacan de los repasos', () => {
    // La del elenco: fallos hace 40, 30, 20 y 1 días (el 15/03/2027).
    expect(recurringDifficulty(['2027-02-03', '2027-02-13', '2027-02-23', '2027-03-14'])).toEqual({
      reason: 'total',
      failures: 4,
    });
  });

  it('[CA-154] 3 fallos dentro de 30 días también; 3 más separados o 2, no', () => {
    expect(recurringDifficulty(['2027-03-01', '2027-03-10', '2027-03-30'])).toEqual({
      reason: 'thirtyDays',
      failures: 3,
    });
    expect(recurringDifficulty(['2027-01-01', '2027-03-01', '2027-03-31'])).toBeNull();
    expect(recurringDifficulty(['2027-03-01', '2027-03-02'])).toBeNull();
    expect(recurringDifficulty([])).toBeNull();
    // Tres seguidos en 30 días en el medio de otros más separados.
    expect(recurringDifficulty(['2026-10-01', '2027-02-01', '2027-02-10', '2027-02-20'])).toEqual({
      reason: 'total',
      failures: 4,
    });
    expect(recurringDifficulty(['2026-10-01', '2027-02-01', '2027-02-10'])).toBeNull();
  });
});

describe('el tipo de error', () => {
  const short = (written: string, expected: string, confused = false): MistakeInput => ({
    activityType: 'short',
    written,
    expected,
    confused,
  });

  it('[CA-155] por regla: tipeo, olvido o confusión en las respuestas cortas; cálculo, opción, orden o idea faltante en las demás', () => {
    expect(mistakeTypeOf(short('Paría', 'París'))).toBe('distraction');
    expect(mistakeTypeOf(short('asdf', 'París'))).toBe('forgotten');
    expect(mistakeTypeOf(short('', 'París'))).toBe('forgotten');
    expect(mistakeTypeOf(short('Roma', 'París', true))).toBe('confusion');
    expect(
      mistakeTypeOf({
        activityType: 'card',
        written: 'La meda',
        expected: 'La media',
        confused: false,
      }),
    ).toBe('distraction');
    expect(
      mistakeTypeOf({ activityType: 'numeric', written: '6', expected: '5', confused: false }),
    ).toBe('calculation');
    expect(
      mistakeTypeOf({
        activityType: 'options',
        written: 'La moda',
        expected: 'La mediana',
        confused: false,
      }),
    ).toBe('confusion');
    expect(
      mistakeTypeOf({
        activityType: 'order',
        written: 'b · a',
        expected: 'a · b',
        confused: false,
      }),
    ).toBe('stepOrder');
    expect(
      mistakeTypeOf({
        activityType: 'open',
        written: 'algo',
        expected: 'tres ideas',
        confused: false,
      }),
    ).toBe('missingIdea');
  });

  it('[CA-155] una respuesta corta de una o dos letras no se toma como tipeo aunque difiera en una', () => {
    expect(mistakeTypeOf(short('a', 'b'))).toBe('forgotten');
    expect(mistakeTypeOf(short('5', '6'))).toBe('forgotten');
  });
});
