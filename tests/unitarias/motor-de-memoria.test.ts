import { default_w } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import {
  ACTIVE_RETENTION,
  appearanceRule,
  engineGradeOf,
  explainDue,
  GENERAL_ESTIMATE_ATTEMPTS,
  type Grade,
  type HelpLevel,
  MAINTENANCE_RETENTION,
  MEMORY_ENGINE_VERSION,
  MEMORY_PARAMETERS,
  MEMORY_PARAMETERS_VERSION,
  type MemoryEvent,
  newCardMemory,
  outOfTen,
  projectCardMemory,
  recallProbability,
  retentionForSubject,
  reviewCard,
  traceCardMemory,
  UnknownEngineError,
} from '../../src/core/memory';
import { studyDayOf } from '../../src/core/study-day';
import { FSRS6_DEFAULT_PARAMETERS } from '../../tools/lib/fsrs6.mjs';
import { inBuenosAires } from '../apoyo/fechas';

// El motor de memoria de la Fase 09 (versión 2): ts-fsrs con FSRS-6 y sus parámetros por defecto,
// en días de estudio, con las reglas de Retenia encima (un solo repaso por día, la ayuda, las
// anulaciones). Todo entra por parámetro: el historial, la retención y el día de hoy.

const CARD = '01969f1e-0000-7000-8000-00000000c0de';
const created = inBuenosAires('15/03/2027 10:00');

let seq = 0;
function review(
  at: string,
  grade: Grade,
  extra: { helpLevel?: HelpLevel; interrupted?: boolean; defective?: boolean; fuzz?: boolean } = {},
): MemoryEvent {
  seq += 1;
  return { kind: 'review', id: `r${seq}`, seq, occurredAt: inBuenosAires(at), grade, ...extra };
}
function annul(reviewEvent: MemoryEvent): MemoryEvent {
  seq += 1;
  return { kind: 'annulled', id: `a${seq}`, seq, reviewId: reviewEvent.id };
}

function project(events: MemoryEvent[], retention = ACTIVE_RETENTION, createdAt = created) {
  return projectCardMemory(
    { cardId: CARD, createdAt, events },
    { retention },
    MEMORY_ENGINE_VERSION,
  );
}
const dueDay = (events: MemoryEvent[], retention = ACTIVE_RETENTION) =>
  studyDayOf(project(events, retention).dueAt);

describe('motor de memoria: el primer repaso de una tarjeta nueva', () => {
  it.for([
    { label: 'La sabía', grade: 'good', expected: '2027-03-17', shown: '17/03/2027' },
    { label: 'Con dudas', grade: 'hard', expected: '2027-03-16', shown: '16/03/2027' },
    { label: 'No la sabía', grade: 'again', expected: '2027-03-16', shown: '16/03/2027' },
  ] as const)(
    '[CA-058] tarjeta nueva de la materia activa repasada el 15/03/2027 con «$label»: vuelve el $shown',
    ({ grade, expected }) => {
      expect(dueDay([review('15/03/2027 10:00', grade)])).toBe(expected);
    },
  );

  it('[CA-058] no existe «fácil»: el motor solo recibe «No la sabía», «Con dudas» y «La sabía»', () => {
    expect(() =>
      project([{ ...review('15/03/2027 10:00', 'good'), grade: 'easy' } as unknown as MemoryEvent]),
    ).toThrow();
  });

  it('[CA-058] sin pasos de minutos: ninguna calificación vuelve el mismo día', () => {
    for (const grade of ['again', 'hard', 'good'] as const) {
      expect(dueDay([review('15/03/2027 23:30', grade)]) > '2027-03-15').toBe(true);
    }
  });
});

describe('motor de memoria: la retención objetivo de la materia', () => {
  it('[CA-060] 0,90 para la materia activa y 0,85 para una en mantenimiento, según su estado al calcular', () => {
    expect(ACTIVE_RETENTION).toBe(0.9);
    expect(MAINTENANCE_RETENTION).toBe(0.85);
    expect(retentionForSubject('active')).toBe(0.9);
    expect(retentionForSubject('maintenance')).toBe(0.85);
    // Una materia en pausa o archivada no avanza: se repasa como una en mantenimiento.
    expect(retentionForSubject('paused')).toBe(0.85);
    expect(retentionForSubject('archived')).toBe(0.85);
    // Una tarjeta sin materia (de antes de la Fase 08) usa la de la materia activa.
    expect(retentionForSubject(null)).toBe(0.9);
  });

  it('[CA-060] el mismo repaso en una tarjeta nueva de una materia en mantenimiento vuelve más tarde: el viernes 19/03/2027 en vez del miércoles 17/03/2027', () => {
    const events = [review('15/03/2027 10:00', 'good')];
    expect(dueDay(events, ACTIVE_RETENTION)).toBe('2027-03-17');
    expect(dueDay(events, MAINTENANCE_RETENTION)).toBe('2027-03-19');
  });

  it('[CA-060] una agenda heredada de la Fase 03 (calculada con 0,90) usa la retención de su materia: en mantenimiento vuelve más tarde', () => {
    const at = inBuenosAires('01/03/2027 10:00');
    const adopted = reviewCard(newCardMemory(at), 'good', at);
    const events: MemoryEvent[] = [{ kind: 'adopted', id: 'h', seq: 1, memory: adopted }];
    expect(studyDayOf(project(events, ACTIVE_RETENTION).dueAt)).toBe('2027-03-03');
    expect(project(events, ACTIVE_RETENTION)).toEqual(adopted);
    const kept = project(events, MAINTENANCE_RETENTION);
    expect(studyDayOf(kept.dueAt)).toBe('2027-03-05');
    expect(kept.stability).toBe(adopted.stability);
  });

  it('[CA-060] la retención solo cambia la fecha: la estabilidad y la dificultad son las mismas', () => {
    const events = [review('15/03/2027 10:00', 'good'), review('17/03/2027 10:00', 'hard')];
    const active = project(events, ACTIVE_RETENTION);
    const kept = project(events, MAINTENANCE_RETENTION);
    expect(kept.stability).toBe(active.stability);
    expect(kept.difficulty).toBe(active.difficulty);
    expect(kept.dueAt.getTime()).toBeGreaterThan(active.dueAt.getTime());
  });
});

describe('motor de memoria: repasos tardíos, adelantados y omitidos', () => {
  it('[CA-061] repasada 5 días después de su fecha y acertada: usa los 7 días que pasaron, no cuenta como fallo y el intervalo siguiente es mayor que en fecha', () => {
    const first = review('15/03/2027 10:00', 'good');
    const onTime = [first, review('17/03/2027 10:00', 'good')];
    const late = [first, review('22/03/2027 10:00', 'good')];
    const trace = traceCardMemory(
      { cardId: CARD, createdAt: created, events: late },
      {
        retention: ACTIVE_RETENTION,
      },
    );
    expect(trace.steps.at(-1)?.elapsedDays).toBe(7);
    const lateMemory = project(late);
    const onTimeMemory = project(onTime);
    expect(lateMemory.lapses).toBe(0);
    expect(lateMemory.scheduledDays).toBeGreaterThan(onTimeMemory.scheduledDays);
    expect(studyDayOf(onTimeMemory.dueAt)).toBe('2027-03-28');
    expect(studyDayOf(lateMemory.dueAt)).toBe('2027-04-12');
  });

  it('[CA-061] un repaso omitido no es un fallo: después de semanas sin repasarla, acertarla no suma un olvido y la estabilidad sube', () => {
    const first = review('15/03/2027 10:00', 'good');
    const before = project([first]);
    // Vencía el 17/03 y no se repasó: la probabilidad de recordarla baja con los días…
    expect(recallProbability(before, '2027-03-17')).toBeGreaterThan(0.9);
    expect(recallProbability(before, '2027-05-10')).toBeLessThan(0.7);
    // …pero el día omitido no es un fallo: acertarla el 10/05 no cuenta un olvido y la estabilidad
    // crece más que en fecha. Un fallo de verdad sí suma un olvido.
    const afterOmission = project([first, review('10/05/2027 10:00', 'good')]);
    expect(afterOmission.lapses).toBe(0);
    expect(afterOmission.stability).toBeGreaterThan(
      project([first, review('17/03/2027 10:00', 'good')]).stability,
    );
    expect(project([first, review('10/05/2027 10:00', 'again')]).lapses).toBe(1);
  });

  it('[CA-061] un repaso adelantado también usa los días reales: un día antes de su fecha crece menos que en fecha', () => {
    const first = review('15/03/2027 10:00', 'good');
    const early = project([first, review('16/03/2027 10:00', 'good')]);
    const onTime = project([first, review('17/03/2027 10:00', 'good')]);
    expect(early.stability).toBeLessThan(onTime.stability);
    expect(early.stability).toBeGreaterThan(project([first]).stability);
  });

  it('los días son días de estudio de Buenos Aires: de las 22:00 a las 10:00 del día siguiente pasó un día aunque en UTC sea el mismo', () => {
    const night = review('15/03/2027 22:00', 'good');
    const morning = review('16/03/2027 10:00', 'good');
    const trace = traceCardMemory(
      { cardId: CARD, createdAt: created, events: [night, morning] },
      {
        retention: ACTIVE_RETENTION,
      },
    );
    expect(trace.steps.map((step) => step.counted)).toEqual([true, true]);
    expect(trace.steps[1]?.elapsedDays).toBe(1);
  });
});

describe('motor de memoria: al motor solo le llega el primer intento del día', () => {
  it('un segundo repaso el mismo día queda anotado pero no mueve la fecha', () => {
    const failed = [review('15/03/2027 10:00', 'again')];
    const twice = [...failed, review('15/03/2027 10:20', 'good')];
    expect(project(twice)).toEqual(project(failed));
    const trace = traceCardMemory(
      { cardId: CARD, createdAt: created, events: twice },
      {
        retention: ACTIVE_RETENTION,
      },
    );
    expect(trace.steps.map((step) => step.reason)).toEqual(['counted', 'sameDay']);
  });

  it('a las 02:30 del 16/03 todavía es el día de estudio del 15/03: tampoco cuenta', () => {
    const twice = [review('15/03/2027 10:00', 'good'), review('16/03/2027 02:30', 'again')];
    expect(dueDay(twice)).toBe('2027-03-17');
  });

  it('si el reloj volvió atrás, un repaso de un día anterior al último tampoco mueve nada, y queda marcado como de fecha anterior, no como del mismo día', () => {
    const events = [review('20/03/2027 10:00', 'good'), review('15/03/2027 10:00', 'again')];
    expect(project(events)).toEqual(project(events.slice(0, 1)));
    const trace = traceCardMemory({ cardId: CARD, createdAt: created, events }, { retention: 0.9 });
    expect(trace.steps.map((step) => step.reason)).toEqual(['counted', 'earlier']);
  });

  it('«¿Por qué hoy?» con el último repaso en una fecha posterior a hoy no dice «hoy»: avisa que la fecha volvió atrás', () => {
    const trace = traceCardMemory(
      { cardId: CARD, createdAt: created, events: [review('22/03/2027 10:00', 'good')] },
      { retention: 0.9 },
    );
    expect(explainDue(trace, '2027-03-15')).toEqual({ kind: 'ahead', general: true });
  });

  it('el día de la próxima fecha es el del repaso más el intervalo aunque Buenos Aires cambie de horario (como en 2008)', () => {
    // El 19/10/2008 Buenos Aires adelantó la hora: sumar 48 horas a las 03:30 del 18/10 (día de
    // estudio 17/10) cae a las 04:30 del 20/10, que ya es el día de estudio 20/10.
    const memory = projectCardMemory(
      {
        cardId: CARD,
        createdAt: new Date('2008-10-17T12:00:00-03:00'),
        events: [
          {
            kind: 'review',
            id: 'r',
            seq: 1,
            occurredAt: new Date('2008-10-18T03:30:00-03:00'),
            grade: 'good',
          },
        ],
      },
      { retention: 0.9 },
      MEMORY_ENGINE_VERSION,
    );
    expect(memory.scheduledDays).toBe(2);
    expect(studyDayOf(memory.dueAt)).toBe('2008-10-19');
  });
});

describe('motor de memoria: la ayuda', () => {
  it.for([
    { helpLevel: 'A0', grade: 'good', expected: 'good', button: 'La sabía', taken: 'La sabía' },
    { helpLevel: 'A1', grade: 'good', expected: 'good', button: 'La sabía', taken: 'La sabía' },
    { helpLevel: 'A2', grade: 'good', expected: 'hard', button: 'La sabía', taken: 'Con dudas' },
    { helpLevel: 'A3', grade: 'good', expected: 'hard', button: 'La sabía', taken: 'Con dudas' },
    { helpLevel: 'A4', grade: 'good', expected: 'again', button: 'La sabía', taken: 'No la sabía' },
    { helpLevel: 'A2', grade: 'hard', expected: 'hard', button: 'Con dudas', taken: 'Con dudas' },
    {
      helpLevel: 'A3',
      grade: 'again',
      expected: 'again',
      button: 'No la sabía',
      taken: 'No la sabía',
    },
    {
      helpLevel: 'A4',
      grade: 'hard',
      expected: 'again',
      button: 'Con dudas',
      taken: 'No la sabía',
    },
    { helpLevel: 'A0', grade: 'hard', expected: 'hard', button: 'Con dudas', taken: 'Con dudas' },
    {
      helpLevel: 'A0',
      grade: 'again',
      expected: 'again',
      button: 'No la sabía',
      taken: 'No la sabía',
    },
  ] as const)(
    '[CA-064] con ayuda $helpLevel y «$button» el motor recibe «$taken»',
    ({ helpLevel, grade, expected }) => {
      expect(engineGradeOf({ grade, helpLevel })).toBe(expected);
    },
  );

  it('[CA-064] interrumpido o con la tarjeta marcada como defectuosa no mueve nada', () => {
    expect(engineGradeOf({ grade: 'good', helpLevel: 'A0', interrupted: true })).toBeNull();
    expect(engineGradeOf({ grade: 'good', helpLevel: 'A0', defective: true })).toBeNull();
    const first = review('15/03/2027 10:00', 'good');
    for (const extra of [{ interrupted: true }, { defective: true }]) {
      expect(project([first, review('17/03/2027 10:00', 'again', extra)])).toEqual(
        project([first]),
      );
    }
  });

  it('[CA-064] una tarjeta nueva acertada con pista de concepto vuelve como con «Con dudas»; con la solución vista, como con «No la sabía»', () => {
    const conPista = project([review('15/03/2027 10:00', 'good', { helpLevel: 'A2' })]);
    const conDudas = project([review('15/03/2027 10:00', 'hard')]);
    const conSolucion = project([review('15/03/2027 10:00', 'good', { helpLevel: 'A4' })]);
    const noLaSabia = project([review('15/03/2027 10:00', 'again')]);
    expect({ ...conPista, lastReviewAt: null }).toEqual({ ...conDudas, lastReviewAt: null });
    expect(conSolucion.stability).toBe(noLaSabia.stability);
    expect(studyDayOf(conSolucion.dueAt)).toBe('2027-03-16');
  });

  it('[CA-064] un intento interrumpido no cuenta como el primero del día: el siguiente sí llega al motor', () => {
    const first = review('15/03/2027 10:00', 'good');
    const events = [
      first,
      review('17/03/2027 10:00', 'good', { interrupted: true }),
      review('17/03/2027 10:30', 'good'),
    ];
    expect(project(events)).toEqual(
      project([first, { ...review('17/03/2027 10:30', 'good'), seq: 99 }]),
    );
  });
});

describe('motor de memoria: anular un repaso', () => {
  it('[CA-063] anular el único repaso deja la tarjeta como nueva', () => {
    const first = review('15/03/2027 10:00', 'good');
    expect(project([first, annul(first)])).toEqual(project([]));
  });

  it('[CA-063] anular el último repaso devuelve exactamente la memoria y la fecha de antes', () => {
    const first = review('15/03/2027 10:00', 'good');
    const second = review('17/03/2027 10:00', 'hard');
    expect(project([first, second, annul(second)])).toEqual(project([first]));
  });

  it('[CA-063] un repaso del mismo día que no contaba pasa a contar si se anula el primero', () => {
    const first = review('15/03/2027 10:00', 'again');
    const second = review('15/03/2027 10:20', 'good');
    const trace = traceCardMemory(
      { cardId: CARD, createdAt: created, events: [first, second, annul(first)] },
      { retention: ACTIVE_RETENTION },
    );
    expect(trace.steps.map((step) => step.reason)).toEqual(['annulled', 'counted']);
    expect(studyDayOf(trace.memory.dueAt)).toBe('2027-03-17');
  });

  it('[CA-063] anular algo que no es un repaso de esta tarjeta no cambia nada', () => {
    const first = review('15/03/2027 10:00', 'good');
    const stray: MemoryEvent = { kind: 'annulled', id: 'x', seq: 50, reviewId: 'otra' };
    expect(project([first, stray])).toEqual(project([first]));
  });
});

describe('motor de memoria: probabilidad de recordar y «¿Por qué hoy?»', () => {
  // «¿Qué mide el desvío estándar?» en el elenco: «No la sabía» hace 27 días, «La sabía» hace 25 y
  // «Con dudas» hace 23 (el 20/02/2027).
  const desvio = () => [
    review('16/02/2027 10:00', 'again'),
    review('18/02/2027 10:00', 'good'),
    review('20/02/2027 10:00', 'hard'),
  ];

  it('[CA-065] la probabilidad estimada de recordar hoy sale de la estabilidad y de los días que pasaron', () => {
    const memory = project(desvio());
    const probability = recallProbability(memory, '2027-03-15');
    expect(probability).toBeCloseTo(0.7713, 4);
    expect(recallProbability(memory, '2027-02-20')).toBe(1);
    // Una tarjeta nueva no tiene probabilidad: todavía no la viste.
    expect(recallProbability(project([]), '2027-03-15')).toBeNull();
  });

  it('[CA-065] «unos N de cada 10» redondea hacia abajo, sin decimales: nunca promete más de lo estimado', () => {
    expect(outOfTen(0.7713)).toBe(7);
    expect(outOfTen(0.6755)).toBe(6);
    expect(outOfTen(0.999)).toBe(9);
    expect(outOfTen(1)).toBe(10);
    expect(outOfTen(0.04)).toBe(0);
  });

  it('[CA-065] «¿Por qué hoy?» del desvío estándar: hace 23 días, la última vez te costó, unos 7 de cada 10', () => {
    const events = desvio();
    const trace = traceCardMemory(
      { cardId: CARD, createdAt: created, events },
      {
        retention: ACTIVE_RETENTION,
      },
    );
    expect(explainDue(trace, '2027-03-15')).toEqual({
      kind: 'seen',
      daysSince: 23,
      lastResult: 'hard',
      outOfTen: 7,
      general: true,
    });
  });

  it('[CA-065] «Estimación general (sin datos tuyos)» mientras la tarjeta tiene menos de 5 intentos', () => {
    expect(GENERAL_ESTIMATE_ATTEMPTS).toBe(5);
    const four = ['01/03', '03/03', '07/03', '12/03'].map((day) =>
      review(`${day}/2027 10:00`, 'good'),
    );
    const five = [...four, review('15/03/2027 09:00', 'good')];
    const explain = (events: MemoryEvent[]) =>
      explainDue(
        traceCardMemory({ cardId: CARD, createdAt: created, events }, { retention: 0.9 }),
        '2027-03-15',
      );
    expect(explain(four)).toMatchObject({ general: true });
    expect(explain(five)).toMatchObject({ general: false, daysSince: 0, outOfTen: 10 });
    // Un repaso anulado no es un intento tuyo, y cinco el mismo día cuentan como uno solo: el
    // motor usó uno.
    const sameDay = ['09:00', '09:10', '09:20', '09:30', '09:40'].map((time) =>
      review(`01/03/2027 ${time}`, 'good'),
    );
    expect(explain(sameDay)).toMatchObject({ general: true, daysSince: 14 });
    const lastFive = five.at(-1) as MemoryEvent;
    expect(explain([...five, annul(lastFive)])).toMatchObject({ general: true });
  });

  it('[CA-065] una tarjeta nueva dice que es nueva, con la estimación general', () => {
    const trace = traceCardMemory(
      { cardId: CARD, createdAt: created, events: [] },
      {
        retention: 0.9,
      },
    );
    expect(explainDue(trace, '2027-03-15')).toEqual({ kind: 'new', general: true });
  });

  it('[CA-065] «cómo salió» es lo que tomó el motor: un acierto con pista de concepto dice que costó', () => {
    const trace = traceCardMemory(
      {
        cardId: CARD,
        createdAt: created,
        events: [review('10/03/2027 10:00', 'good', { helpLevel: 'A2' })],
      },
      { retention: 0.9 },
    );
    expect(explainDue(trace, '2027-03-15')).toMatchObject({ lastResult: 'hard', daysSince: 5 });
  });
});

describe('motor de memoria: por qué apareció la tarjeta', () => {
  const today = '2027-03-15';
  it('nueva o con la fecha vencida: «vencida»; ya fallada hoy: «reaprendizaje»; antes de su fecha: «elegida por mí»', () => {
    const fresh = project([]);
    expect(appearanceRule({ memory: fresh, today, failedToday: false })).toBe('due');
    const overdue = project([review('10/03/2027 10:00', 'good')]);
    expect(appearanceRule({ memory: overdue, today, failedToday: false })).toBe('due');
    const failed = project([review('15/03/2027 09:00', 'again')]);
    expect(appearanceRule({ memory: failed, today, failedToday: true })).toBe('relearning');
    const early = project([review('14/03/2027 10:00', 'good')]);
    expect(appearanceRule({ memory: early, today, failedToday: false })).toBe('chosen');
  });
});

describe('motor de memoria: variación al azar de las fechas', () => {
  // Una historia que llega a un intervalo largo: con la variación, la fecha se corre un poco.
  const long = (fuzz: boolean) => [
    review('15/03/2027 10:00', 'good', { fuzz }),
    review('17/03/2027 10:00', 'good', { fuzz }),
    review('28/03/2027 10:00', 'good', { fuzz }),
  ];

  it('sin variación (demostración y pruebas) el intervalo es el de la fórmula', () => {
    expect(dueDay(long(false))).toBe('2027-05-13');
  });

  it('con variación (uso real) la fecha queda cerca de la de la fórmula y es reproducible: la semilla sale de la tarjeta y del repaso', () => {
    const projectFor = (cardId: string) =>
      projectCardMemory(
        { cardId, createdAt: created, events: long(true) },
        { retention: 0.9 },
        MEMORY_ENGINE_VERSION,
      );
    const once = projectFor(CARD);
    expect(projectFor(CARD)).toEqual(once);
    const base = project(long(false)).scheduledDays;
    const spread = new Set<number>();
    for (let n = 0; n < 40; n++) {
      const days = projectFor(
        `01969f1e-0000-7000-8000-${String(n).padStart(12, '0')}`,
      ).scheduledDays;
      expect(Math.abs(days - base)).toBeLessThanOrEqual(Math.ceil(base * 0.1) + 1);
      spread.add(days);
    }
    expect(spread.size).toBeGreaterThan(1);
  });

  it('[CA-058] con variación al azar, las fechas cortas no cambian: no hay variación por debajo de los 2,5 días', () => {
    for (const [grade, expected] of [
      ['good', '2027-03-17'],
      ['hard', '2027-03-16'],
      ['again', '2027-03-16'],
    ] as const) {
      expect(dueDay([review('15/03/2027 10:00', grade, { fuzz: true })])).toBe(expected);
    }
  });
});

describe('motor de memoria: versión y parámetros', () => {
  it('es la versión 2 del motor, con los 21 parámetros publicados de FSRS-6 sin ajustar', () => {
    expect(MEMORY_ENGINE_VERSION).toBe(2);
    expect(MEMORY_PARAMETERS_VERSION).toBe('fsrs6-default');
    expect([...MEMORY_PARAMETERS]).toEqual([...FSRS6_DEFAULT_PARAMETERS]);
    expect([...MEMORY_PARAMETERS]).toEqual([...default_w]);
  });

  it('con una versión del motor que no conoce, falla en vez de inventar una agenda', () => {
    expect(() =>
      projectCardMemory({ cardId: CARD, createdAt: created, events: [] }, { retention: 0.9 }, 99),
    ).toThrow(UnknownEngineError);
  });
});
