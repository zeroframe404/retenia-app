import { describe, expect, it } from 'vitest';
import {
  backlogDays,
  brakeFor,
  brakeWithRecovery,
  cardPriority,
  composeSession,
  durationLabel,
  estimateSeconds,
  INITIAL_SECONDS,
  inactivityCapSeconds,
  isLate,
  LOAD_POLICY_VERSION,
  learnedEstimate,
  maintenanceQuotaMinutes,
  measureAttempt,
  newCardsCost,
  postponeOutcome,
  prepMinutes,
  type ReviewCandidate,
  roundToFiveMinutes,
  splitOutliers,
} from '../../src/core/load';

declare module 'vitest' {
  interface TaskMeta {
    // Una fila de la tabla de casos, para que el tablero muestre lo esperado y lo obtenido.
    tableCase?: { table: string; input: string; expected: string; actual: string };
  }
}

// Las reglas puras de la carga en minutos (Fase 11): cuánto tarda cada cosa, qué entra en una
// sesión de T minutos, cuánto freno pone el atraso y cuándo vuelve lo que se pospone.

const TABLE_SESSION = 'Carga de la sesión (60 repasos de 12 s y 30 tarjetas nuevas)';
const TABLE_BRAKE = 'Freno por atraso (en días de capacidad)';
const TABLE_SHRINK = 'Tiempo de un repaso: lo tuyo contra el valor inicial de 12 s';
const TABLE_PRIORITY = 'Prioridad de un repaso';
const TABLE_CAP = 'Corte de inactividad de un intento';

const numbers = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });
const fmt = (value: number) => numbers.format(value);

// n repasos vencidos: de más a menos urgentes, así el orden esperado es el de las posiciones.
function reviews(count: number, extra: Partial<ReviewCandidate> = {}): ReviewCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    cardId: `r${String(index).padStart(3, '0')}`,
    recall: 0.5 + index * 0.003,
    dueDay: '2027-03-15',
    siblingGroupId: null,
    postponements: 0,
    ...extra,
  }));
}

const newIds = (count: number) =>
  Array.from({ length: count }, (_, index) => `n${String(index).padStart(3, '0')}`);

const ELENCO = { reviewSeconds: 12, newCardSeconds: 60 };
const FULL = brakeFor(0.48);

function plan(minutes: number, brake = FULL, due = 60, fresh = 30) {
  return composeSession({
    minutes,
    reviews: reviews(due),
    newCards: newIds(fresh),
    brake,
    ...ELENCO,
  });
}

describe('valores iniciales y preparación', () => {
  it('[CA-088] los valores iniciales por tipo: repaso 12 s, tarjeta nueva 60 s, comprensión 2 min, problema 8 min y bloque práctico 30 min', () => {
    expect(INITIAL_SECONDS).toEqual({
      review: 12,
      newCard: 60,
      comprehension: 120,
      problem: 480,
      practiceBlock: 1800,
    });
  });

  it('[CA-079] la preparación de la sesión es 1 minuto con 10 minutos o menos y 2 con más', () => {
    expect([5, 10, 25, 45].map(prepMinutes)).toEqual([1, 1, 2, 2]);
  });

  it('[CA-094] la política de carga tiene una versión, que se registra en cada sesión', () => {
    expect(LOAD_POLICY_VERSION).toBe(1);
  });
});

describe('composición de la sesión por minutos', () => {
  it.for([
    {
      minutes: 25,
      id: 'CA-079',
      expected: '60 repasos, 10 nuevas, 0 para mañana, unos 25 min',
    },
    {
      minutes: 10,
      id: 'CA-080',
      expected: '45 repasos, 0 nuevas, 15 para mañana, unos 10 min',
    },
    {
      minutes: 5,
      id: 'CA-081',
      expected: '20 repasos, 0 nuevas, 40 para mañana, unos 5 min',
    },
    {
      minutes: 45,
      id: 'CA-082',
      expected: '60 repasos, 18 nuevas, 0 para mañana, unos 30 min',
    },
  ])(
    '[$id] con $minutes minutos: $expected (no se rellena hasta llegar al tiempo)',
    ({ minutes, expected }, { task }) => {
      const result = plan(minutes);
      const shown = roundToFiveMinutes(result.estimatedSeconds / 60);
      const actual = `${result.reviews.length} repasos, ${result.newCards.length} nuevas, ${result.postponed.length} para mañana, unos ${shown} min`;
      task.meta.tableCase = {
        table: TABLE_SESSION,
        input: `Tengo ${minutes} min`,
        expected,
        actual,
      };
      expect(actual).toBe(expected);
    },
  );

  it('[CA-080] los repasos que no entran quedan para mañana, los menos urgentes, sin calificarse', () => {
    const result = plan(10);
    expect(result.postponed.map((entry) => entry.reason)).toEqual(Array(15).fill('noFit'));
    expect(result.postponed.map((entry) => entry.cardId)).toEqual(
      reviews(60)
        .slice(45)
        .map((card) => card.cardId),
    );
  });

  it('[CA-079] los repasos van del que más conviene repasar al que menos, y las nuevas llevan el orden en que llegan', () => {
    const result = plan(25);
    expect(result.reviews[0]).toBe('r000');
    expect(result.newCards).toEqual(newIds(10));
  });

  it('[CA-082] si hay menos nuevas que las que caben, entran solo esas y la sesión no se rellena', () => {
    const result = plan(45, FULL, 60, 4);
    expect(result.newCards).toHaveLength(4);
    expect(result.estimatedSeconds / 60).toBeLessThan(20);
  });

  it('[CA-079] sin repasos vencidos, lo nuevo usa lo que sobra con el tope del 40 % del tiempo', () => {
    expect(plan(25, FULL, 0, 30).newCards).toHaveLength(10);
    expect(plan(10, FULL, 0, 30).newCards).toHaveLength(4);
  });

  it('[CA-092] las hermanas de una familia: entra una sola y las otras pasan a mañana sin contarse como aplazamiento', () => {
    const family = reviews(3, { siblingGroupId: 'familia' });
    const result = composeSession({
      minutes: 25,
      reviews: family,
      newCards: [],
      brake: FULL,
      ...ELENCO,
    });
    expect(result.reviews).toEqual(['r000']);
    expect(result.deferredSiblings).toEqual(['r001', 'r002']);
    expect(result.postponed).toEqual([]);
  });

  it('[CA-093] una tarjeta aplazada 3 veces entra sí o sí, primera, aunque no entre en el tiempo', () => {
    const due = [
      ...reviews(60),
      { ...reviews(1)[0], cardId: 'vieja', recall: 0.99, postponements: 3 },
    ];
    const result = composeSession({
      minutes: 5,
      reviews: due,
      newCards: [],
      brake: FULL,
      ...ELENCO,
    });
    expect(result.reviews[0]).toBe('vieja');
    expect(result.forced).toEqual(['vieja']);
    expect(result.reviews).toHaveLength(20);
  });

  it('[CA-092] los reaprendizajes de hoy van antes que cualquier repaso vencido', () => {
    const due = reviews(60);
    const result = composeSession({
      minutes: 25,
      reviews: due.map((card) => (card.cardId === 'r059' ? { ...card, relearning: true } : card)),
      newCards: [],
      brake: FULL,
      ...ELENCO,
    });
    expect(result.reviews[0]).toBe('r059');
  });
});

describe('freno por atraso', () => {
  it.for([
    { days: 0.3, band: 'full', expected: 'lo nuevo completo' },
    { days: 1.2, band: 'half', expected: 'la mitad de lo nuevo' },
    { days: 3, band: 'few', expected: 'hasta 3 tarjetas nuevas' },
    { days: 6, band: 'none', expected: 'ninguna tarjeta nueva' },
  ])('[CA-085] con $days días de atraso: $expected', ({ days, band, expected }, { task }) => {
    const brake = brakeFor(days);
    const result = plan(25, brake);
    const shown = {
      full: 'lo nuevo completo',
      half: 'la mitad de lo nuevo',
      few: 'hasta 3 tarjetas nuevas',
      none: 'ninguna tarjeta nueva',
    }[brake.band];
    task.meta.tableCase = {
      table: TABLE_BRAKE,
      input: `${fmt(days)} días`,
      expected,
      actual: shown,
    };
    expect(brake.band).toBe(band);
    expect(shown).toBe(expected);
    const counts = { full: 10, half: 5, few: 3, none: 0 } as const;
    expect(result.newCards).toHaveLength(counts[brake.band]);
  });

  it.for([
    { days: 0, band: 'full' },
    { days: 0.49, band: 'full' },
    { days: 0.5, band: 'half' },
    { days: 1.99, band: 'half' },
    { days: 2, band: 'few' },
    { days: 5, band: 'few' },
    { days: 5.01, band: 'none' },
  ])('[CA-085] bordes: $days días es «$band»', ({ days, band }) => {
    expect(brakeFor(days).band).toBe(band);
  });

  it('[CA-085] los días de atraso son los minutos de repasos atrasados sobre los minutos de estudio por día', () => {
    expect(backlogDays(12, 25)).toBeCloseTo(0.48, 10);
    expect(backlogDays(150, 25)).toBe(6);
    expect(backlogDays(10, 0)).toBe(0);
  });

  it('[CA-086] el freno vuelve a 1 cuando el atraso estuvo bajo 0,5 durante 3 días seguidos, no antes', () => {
    expect(brakeWithRecovery([3, 0.4, 0.3, 0.2]).band).toBe('half');
    expect(brakeWithRecovery([3, 0.4, 0.3, 0.2, 0.1]).band).toBe('full');
    expect(brakeWithRecovery([0.4, 0.3, 0.2]).band).toBe('full');
    expect(brakeWithRecovery([1, 0.4, 0.3, 0.6, 0.2, 0.2]).band).toBe('half');
    expect(brakeWithRecovery([6]).band).toBe('none');
    expect(brakeWithRecovery([6, 0.2]).band).toBe('half');
  });

  it('[CA-085] una tarjeta está atrasada si su retraso supera el 50 % del intervalo o su recuerdo cayó 10 puntos bajo el objetivo', () => {
    expect(isLate({ overdueDays: 6, intervalDays: 10, recall: 0.9, targetRetention: 0.9 })).toBe(
      true,
    );
    expect(isLate({ overdueDays: 5, intervalDays: 10, recall: 0.9, targetRetention: 0.9 })).toBe(
      false,
    );
    expect(isLate({ overdueDays: 0, intervalDays: 10, recall: 0.79, targetRetention: 0.9 })).toBe(
      true,
    );
    expect(isLate({ overdueDays: 0, intervalDays: 10, recall: 0.81, targetRetention: 0.9 })).toBe(
      false,
    );
  });
});

describe('tiempo que tarda cada cosa', () => {
  it.for([
    { count: 0, median: 12, expected: '12 segundos' },
    { count: 10, median: 10, expected: '11 segundos' },
    { count: 40, median: 10, expected: '10,4 segundos' },
  ])(
    '[CA-088] con $count repasos tuyos de mediana $median s: $expected',
    ({ count, median, expected }, { task }) => {
      const estimate = estimateSeconds({ count, medianSeconds: median }, INITIAL_SECONDS.review);
      const actual = `${fmt(estimate)} segundos`;
      task.meta.tableCase = {
        table: TABLE_SHRINK,
        input: `${count} repasos tuyos, mediana ${median} s`,
        expected,
        actual,
      };
      expect(actual).toBe(expected);
    },
  );

  it('[CA-088] sin repasos propios da el valor inicial y con muchos se acerca a lo propio', () => {
    expect(estimateSeconds({ count: 0, medianSeconds: 99 }, 12)).toBe(12);
    expect(estimateSeconds({ count: 1000, medianSeconds: 6 }, 12)).toBeCloseTo(6.06, 2);
  });

  it('[CA-088] se aprende de los últimos 60 días o 200 intentos, lo que sea menos', () => {
    const attempts = [
      ...Array.from({ length: 250 }, (_, index) => ({ seconds: 10, daysAgo: index / 10 })),
      { seconds: 10, daysAgo: 61 },
    ];
    expect(learnedEstimate(attempts, 12).count).toBe(200);
    const old = Array.from({ length: 30 }, () => ({ seconds: 10, daysAgo: 61 }));
    expect(learnedEstimate(old, 12)).toMatchObject({ count: 0, estimateSeconds: 12 });
  });

  it('[CA-089] con menos de 20 intentos propios la duración va redondeada a 5 minutos con la etiqueta «estimación inicial»', () => {
    expect(durationLabel(23, 5)).toEqual({ minutes: 25, initial: true });
    expect(durationLabel(31, 0)).toEqual({ minutes: 30, initial: true });
    expect(durationLabel(31, 19).initial).toBe(true);
  });

  it('[CA-089] con 20 intentos propios o más no lleva la etiqueta y sigue redondeada: nunca con segundos ni decimales', () => {
    expect(durationLabel(23, 20)).toEqual({ minutes: 25, initial: false });
    expect(Number.isInteger(durationLabel(12.4, 40).minutes)).toBe(true);
    expect([1, 2, 7, 12.4, 22.6, 27.5, 47].map(roundToFiveMinutes)).toEqual([
      5, 5, 5, 10, 25, 30, 45,
    ]);
  });

  it.for([
    { raw: 300, median: 12, expected: '36 segundos' },
    { raw: 300, median: 60, expected: '120 segundos' },
    { raw: 30, median: 12, expected: '30 segundos' },
    { raw: 36, median: 12, expected: '36 segundos' },
  ])(
    '[CA-090] un intento de $raw s con mediana $median s cuenta $expected como máximo',
    ({ raw, median, expected }, { task }) => {
      const measured = measureAttempt({ rawSeconds: raw, medianSeconds: median });
      const actual = `${fmt(measured.seconds)} segundos`;
      task.meta.tableCase = {
        table: TABLE_CAP,
        input: `${raw} s sin tocar nada, mediana ${median} s`,
        expected,
        actual,
      };
      expect(actual).toBe(expected);
    },
  );

  it('[CA-090] el tope es el menor entre 3 veces la mediana y 120 segundos', () => {
    expect(inactivityCapSeconds(12)).toBe(36);
    expect(inactivityCapSeconds(40)).toBe(120);
    expect(inactivityCapSeconds(41)).toBe(120);
  });

  it('[CA-090] un intento que llega al tope queda fuera del cálculo de la mediana', () => {
    expect(measureAttempt({ rawSeconds: 300, medianSeconds: 12 })).toEqual({
      seconds: 36,
      excluded: true,
    });
    expect(measureAttempt({ rawSeconds: 20, medianSeconds: 12 }).excluded).toBe(false);
    const attempts = [
      ...Array.from({ length: 30 }, () => ({ seconds: 12, daysAgo: 1 })),
      { seconds: 300, daysAgo: 1 },
    ];
    const learned = learnedEstimate(attempts, 12);
    expect(learned.count).toBe(30);
    expect(learned.medianSeconds).toBe(12);
    expect(learned.excluded).toBe(1);
  });

  it('[CA-090] un intento más allá de la mediana más 3 desvíos absolutos medianos se excluye y se conserva como dato', () => {
    const durations = [10, 11, 12, 12, 13, 14, 15, 60];
    const { kept, excluded } = splitOutliers(durations);
    expect(excluded).toEqual([60]);
    expect(kept).toHaveLength(7);
    expect([...kept, ...excluded].sort((a, b) => a - b)).toEqual(durations);
  });

  it('[CA-090] si todos duran igual (desvío cero) no se excluye por unas décimas de más', () => {
    expect(splitOutliers([12, 12, 12, 12, 12.5]).excluded).toEqual([]);
  });
});

describe('prioridad y aplazamiento', () => {
  it('[CA-092] con recuerdo 0,70, la que es requisito de otra y se aplazó 2 veces (0,675) va antes que la que no (0,30)', ({
    task,
  }) => {
    const first = cardPriority({ recall: 0.7, isRequisite: true, postponements: 2 });
    const second = cardPriority({ recall: 0.7, isRequisite: false, postponements: 0 });
    task.meta.tableCase = {
      table: TABLE_PRIORITY,
      input: 'recuerdo 0,70; requisito de otra y aplazada 2 veces contra ninguna de las dos cosas',
      expected: '0,675 va antes que 0,3',
      actual: `${fmt(first)} ${first > second ? 'va antes que' : 'no va antes que'} ${fmt(second)}`,
    };
    expect(first).toBeCloseTo(0.675, 10);
    expect(second).toBeCloseTo(0.3, 10);
    expect(first).toBeGreaterThan(second);
  });

  it('[CA-092] la importancia multiplica y, por defecto, vale 1', () => {
    expect(cardPriority({ recall: 0.5, isRequisite: false, postponements: 0, importance: 2 })).toBe(
      1,
    );
    expect(cardPriority({ recall: 0.5, isRequisite: false, postponements: 0 })).toBe(0.5);
  });

  it('[CA-092] en la sesión se ordenan por esa prioridad', () => {
    const result = composeSession({
      minutes: 25,
      reviews: [
        {
          cardId: 'comun',
          recall: 0.7,
          dueDay: '2027-03-15',
          siblingGroupId: null,
          postponements: 0,
        },
        {
          cardId: 'requisito',
          recall: 0.7,
          dueDay: '2027-03-15',
          siblingGroupId: null,
          postponements: 2,
          isRequisite: true,
        },
      ],
      newCards: [],
      brake: FULL,
      ...ELENCO,
    });
    expect(result.reviews).toEqual(['requisito', 'comun']);
  });

  it('[CA-093] hasta 3 aplazamientos se pospone; en el cuarto la tarjeta pasa a prioridad máxima', () => {
    expect([0, 1, 2].map(postponeOutcome)).toEqual(['postponed', 'postponed', 'postponed']);
    expect(postponeOutcome(3)).toBe('maxPriority');
    expect(postponeOutcome(7)).toBe('maxPriority');
  });
});

describe('mantenimiento y costo de sumar tarjetas', () => {
  it('[CA-079] el cupo de mantenimiento es el 10 % del tiempo de la sesión, en minutos enteros', () => {
    expect([5, 10, 25, 45].map(maintenanceQuotaMinutes)).toEqual([0, 1, 2, 4]);
  });

  it('[CA-087] sumar 10 tarjetas cuesta entre 5 y 10 minutos de repaso en las próximas 4 semanas', () => {
    expect(newCardsCost(10, 12)).toEqual({ lowMinutes: 5, highMinutes: 10 });
    expect(newCardsCost(1, 12)).toEqual({ lowMinutes: 1, highMinutes: 1 });
    expect(newCardsCost(40, 12)).toEqual({ lowMinutes: 20, highMinutes: 40 });
  });
});

describe('la sesión nunca pasa del tiempo elegido', () => {
  it('[CA-082] los minutos estimados no superan el tiempo más el cupo de mantenimiento, en ninguno de los cuatro tiempos', () => {
    for (const minutes of [5, 10, 25, 45]) {
      for (const due of [0, 7, 60, 300]) {
        const result = plan(minutes, FULL, due, 30);
        expect(result.estimatedSeconds / 60).toBeLessThanOrEqual(
          minutes + maintenanceQuotaMinutes(minutes),
        );
      }
    }
  });
});
