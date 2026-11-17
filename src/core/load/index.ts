// La carga en minutos (Fase 11, H-19 a H-22): cuánto tarda cada cosa, qué entra en una sesión de T
// minutos, cuánto freno pone el atraso y cuándo vuelve lo que se pospone. Reglas puras: sin base de
// datos, sin reloj y sin pantalla. El tiempo de respuesta nunca decide cuándo vuelve una tarjeta:
// eso es solo del motor de memoria.

// La versión de esta política: se registra en cada sesión, así se sabe con qué reglas se armó.
export const LOAD_POLICY_VERSION = 1;

// La mediana inicial de cada tipo de actividad, en segundos (los valores con que se empieza, antes
// de saber cómo estudia cada uno).
export const INITIAL_SECONDS = {
  review: 12,
  newCard: 60,
  comprehension: 120,
  problem: 480,
  practiceBlock: 1800,
} as const;

// Con cuántos intentos propios el valor inicial pesa lo mismo que lo propio.
const SHRINKAGE_ATTEMPTS = 10;
// Se aprende de los últimos 60 días o 200 intentos, lo que sea menos.
const WINDOW_DAYS = 60;
const WINDOW_ATTEMPTS = 200;
// Con menos intentos propios que estos, la duración lleva «estimación inicial».
const FEW_ATTEMPTS = 20;
// Un intento no cuenta más que esto sin tocar nada (y, además, 3 veces la mediana).
const INACTIVITY_CAP_SECONDS = 120;
// Cuando casi todos los intentos duran igual el desvío absoluto mediano da 0: se toma al menos esto.
const MAD_FLOOR_SECONDS = 1;

// Lo nuevo no pasa del 40 % del tiempo elegido.
const NEW_SHARE = 0.4;
// Las materias en mantenimiento tienen un cupo del 10 % del tiempo de la sesión.
const MAINTENANCE_SHARE = 0.1;
// Cada tarjeta nueva se repasa entre 2,5 y 5 veces en las 4 semanas que siguen.
const REVIEWS_PER_NEW_CARD = { low: 2.5, high: 5 } as const;
// Una tarjeta se pospone hasta 3 veces; a la cuarta pasa al primer nivel.
export const MAX_POSTPONEMENTS = 3;

// El tiempo fijo de preparar la sesión, en minutos: 1 con 10 minutos o menos y 2 con más.
export function prepMinutes(chosenMinutes: number): number {
  return chosenMinutes <= 10 ? 1 : 2;
}

// El cupo de mantenimiento, en minutos enteros.
export function maintenanceQuotaMinutes(chosenMinutes: number): number {
  return Math.floor(MAINTENANCE_SHARE * chosenMinutes);
}

// --- Cuánto tarda cada cosa ---

// (n × mediana propia + 10 × valor inicial) ÷ (n + 10): sin intentos propios da el inicial y con
// muchos se acerca a lo propio.
export function estimateSeconds(
  own: { count: number; medianSeconds: number },
  initialSeconds: number,
): number {
  if (own.count <= 0) {
    return initialSeconds;
  }
  return (
    (own.count * own.medianSeconds + SHRINKAGE_ATTEMPTS * initialSeconds) /
    (own.count + SHRINKAGE_ATTEMPTS)
  );
}

// El corte de inactividad: un intento cuenta como máximo el menor entre 3 veces la mediana y 120
// segundos.
export function inactivityCapSeconds(medianSeconds: number): number {
  return Math.min(3 * medianSeconds, INACTIVITY_CAP_SECONDS);
}

// Lo que cuenta un intento y si llegó al tope (en ese caso queda fuera del cálculo de la mediana).
export function measureAttempt(input: { rawSeconds: number; medianSeconds: number }): {
  seconds: number;
  excluded: boolean;
} {
  const cap = inactivityCapSeconds(input.medianSeconds);
  return { seconds: Math.min(input.rawSeconds, cap), excluded: input.rawSeconds > cap };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) {
    return 0;
  }
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

// Un intento más allá de la mediana más 3 desvíos absolutos medianos se excluye del cálculo (el
// dato se conserva: acá solo se separa).
export function splitOutliers(durations: readonly number[]): {
  kept: number[];
  excluded: number[];
} {
  if (durations.length < 3) {
    return { kept: [...durations], excluded: [] };
  }
  const center = median(durations);
  const spread = Math.max(
    median(durations.map((value) => Math.abs(value - center))),
    MAD_FLOOR_SECONDS,
  );
  const limit = center + 3 * spread;
  return {
    kept: durations.filter((value) => value <= limit),
    excluded: durations.filter((value) => value > limit),
  };
}

export interface Attempt {
  readonly seconds: number;
  readonly daysAgo: number;
}

// Lo que se aprende de los intentos propios: dentro de la ventana (60 días y 200 intentos), sin los
// que llegaron al tope de inactividad ni los que se salen de la mediana más 3 desvíos.
export function learnedEstimate(
  attempts: readonly Attempt[],
  initialSeconds: number,
): { count: number; medianSeconds: number; estimateSeconds: number; excluded: number } {
  const window = attempts
    .filter((attempt) => attempt.daysAgo <= WINDOW_DAYS)
    .sort((a, b) => a.daysAgo - b.daysAgo)
    .slice(0, WINDOW_ATTEMPTS)
    .map((attempt) => attempt.seconds);
  if (window.length === 0) {
    return {
      count: 0,
      medianSeconds: initialSeconds,
      estimateSeconds: initialSeconds,
      excluded: 0,
    };
  }
  const cap = inactivityCapSeconds(median(window));
  const active = window.filter((seconds) => seconds <= cap);
  const { kept, excluded } = splitOutliers(active);
  const medianSeconds = kept.length === 0 ? initialSeconds : median(kept);
  return {
    count: kept.length,
    medianSeconds,
    estimateSeconds: estimateSeconds({ count: kept.length, medianSeconds }, initialSeconds),
    excluded: window.length - active.length + excluded.length,
  };
}

// Las duraciones se muestran siempre redondeadas a 5 minutos (nunca menos de 5).
export function roundToFiveMinutes(minutes: number): number {
  return Math.max(5, Math.round(minutes / 5) * 5);
}

// La duración que se muestra y si lleva «estimación inicial» (con menos de 20 intentos propios).
export function durationLabel(
  minutes: number,
  ownAttempts: number,
): { minutes: number; initial: boolean } {
  return { minutes: roundToFiveMinutes(minutes), initial: ownAttempts < FEW_ATTEMPTS };
}

// --- El freno por atraso ---

// Los minutos de repasos atrasados medidos en días de lo que se estudia por día.
export function backlogDays(overdueMinutes: number, dailyMinutes: number): number {
  return dailyMinutes <= 0 ? 0 : overdueMinutes / dailyMinutes;
}

export interface Brake {
  readonly band: 'full' | 'half' | 'few' | 'none';
  // Qué parte de lo nuevo que cabe se agrega.
  readonly factor: number;
  // Tope de tarjetas nuevas (nunca más que la mitad que cabe: más atraso nunca da más).
  readonly maxCards: number | null;
}

const FEW_NEW_CARDS = 3;

// Menos de 0,5 días: lo nuevo completo. De 0,5 a menos de 2: la mitad. De 2 a 5: hasta 3
// tarjetas. Más de 5: ninguna.
export function brakeFor(days: number): Brake {
  if (days < 0.5) {
    return { band: 'full', factor: 1, maxCards: null };
  }
  if (days < 2) {
    return { band: 'half', factor: 0.5, maxCards: null };
  }
  if (days <= 5) {
    return { band: 'few', factor: 0.5, maxCards: FEW_NEW_CARDS };
  }
  return { band: 'none', factor: 0, maxCards: null };
}

const RECOVERY_DAYS = 3;

// El freno de hoy a partir del atraso de cada día (del más viejo al de hoy). Una vez frenado,
// vuelve a 1 recién cuando el atraso estuvo bajo 0,5 durante 3 días seguidos (con hoy): mientras
// tanto, la mitad.
export function brakeWithRecovery(dailyBacklog: readonly number[]): Brake {
  let braked = false;
  let calmDays = 0;
  for (const days of dailyBacklog) {
    if (days >= 0.5) {
      braked = true;
      calmDays = 0;
    } else {
      calmDays += 1;
      if (calmDays >= RECOVERY_DAYS) {
        braked = false;
      }
    }
  }
  const today = dailyBacklog.at(-1) ?? 0;
  if (today >= 0.5 || !braked) {
    return brakeFor(today);
  }
  return brakeFor(0.5);
}

// Una tarjeta está atrasada si su retraso supera el 50 % de su intervalo o si su probabilidad de
// recuerdo cayó 10 puntos bajo el objetivo.
export function isLate(card: {
  overdueDays: number;
  intervalDays: number;
  recall: number;
  targetRetention: number;
}): boolean {
  return (
    card.overdueDays > 0.5 * card.intervalDays || card.recall <= card.targetRetention - 0.1 + 1e-9
  );
}

// --- Prioridad y aplazamiento ---

// (1 − probabilidad de recuerdo) × importancia × (1,5 si es requisito de otra) × (1 + 0,25 ×
// aplazamientos).
export function cardPriority(card: {
  recall: number;
  isRequisite: boolean;
  postponements: number;
  importance?: number;
}): number {
  return (
    (1 - card.recall) *
    (card.importance ?? 1) *
    (card.isRequisite ? 1.5 : 1) *
    (1 + 0.25 * card.postponements)
  );
}

// Con las veces que ya se pospuso: hasta 3 se pospone; en la cuarta pasa a prioridad máxima.
export function postponeOutcome(postponements: number): 'postponed' | 'maxPriority' {
  return postponements >= MAX_POSTPONEMENTS ? 'maxPriority' : 'postponed';
}

// Cuánto sumaría a los repasos agregar n tarjetas nuevas, en minutos, repartido en 4 semanas.
export function newCardsCost(
  count: number,
  reviewSeconds: number,
): { lowMinutes: number; highMinutes: number } {
  const minutes = (reviews: number) => (count * reviews * reviewSeconds) / 60;
  const lowMinutes = Math.max(1, Math.round(minutes(REVIEWS_PER_NEW_CARD.low)));
  return {
    lowMinutes,
    highMinutes: Math.max(lowMinutes, Math.round(minutes(REVIEWS_PER_NEW_CARD.high))),
  };
}

// --- La sesión para T minutos ---

export interface ReviewCandidate {
  readonly cardId: string;
  // Probabilidad de recordarla hoy.
  readonly recall: number;
  readonly dueDay: string;
  readonly siblingGroupId: string | null;
  // Cuántas veces se pospuso ya.
  readonly postponements: number;
  readonly importance?: number;
  // Es requisito de otra tarjeta u objetivo.
  readonly isRequisite?: boolean;
  // Fallada hoy: vuelve antes que nada.
  readonly relearning?: boolean;
}

export interface ComposeInput {
  readonly minutes: number;
  readonly reviews: readonly ReviewCandidate[];
  // Las tarjetas nuevas disponibles, en el orden en que entran.
  readonly newCards: readonly string[];
  readonly brake: Brake;
  readonly reviewSeconds: number;
  readonly newCardSeconds: number;
  // Las familias de hermanas de las que ya se repasó una tarjeta hoy.
  readonly studiedGroups?: ReadonlySet<string>;
}

export interface SessionPlan {
  readonly minutes: number;
  readonly prepMinutes: number;
  // Los repasos en el orden en que se estudian: reaprendizajes, los que entran sí o sí y el resto
  // por prioridad.
  readonly reviews: readonly string[];
  readonly relearning: readonly string[];
  readonly forced: readonly string[];
  readonly newCards: readonly string[];
  // Los repasos que no entran: quedan para mañana, sin calificarse.
  readonly postponed: readonly { cardId: string; reason: 'noFit' }[];
  // Las hermanas que pasan a mañana porque ya entró (o se estudió hoy) otra de su familia.
  readonly deferredSiblings: readonly string[];
  readonly estimatedSeconds: number;
  // Cuánto puede pasarse la sesión del tiempo elegido (el cupo de mantenimiento), en minutos.
  readonly toleranceMinutes: number;
}

function byPriority(a: ReviewCandidate, b: ReviewCandidate): number {
  const rank = (card: ReviewCandidate) =>
    card.relearning === true ? 0 : card.postponements >= MAX_POSTPONEMENTS ? 1 : 2;
  if (rank(a) !== rank(b)) {
    return rank(a) - rank(b);
  }
  const priority = (card: ReviewCandidate) =>
    cardPriority({
      recall: card.recall,
      isRequisite: card.isRequisite === true,
      postponements: card.postponements,
      importance: card.importance,
    });
  const delta = priority(b) - priority(a);
  if (Math.abs(delta) > 1e-12) {
    return delta;
  }
  if (a.recall !== b.recall) {
    return a.recall - b.recall;
  }
  if (a.dueDay !== b.dueDay) {
    return a.dueDay < b.dueDay ? -1 : 1;
  }
  return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0;
}

// Qué entra en una sesión de `minutes`: 1) los reaprendizajes de hoy; 2) los repasos vencidos por
// prioridad (los pospuestos 3 veces entran sí o sí); 3) lo nuevo con un presupuesto de
// mínimo(lo que sobra, 40 % del tiempo) × el freno; 4) lo que no entra queda para mañana, sin
// calificarse. La sesión nunca se rellena para llegar al tiempo.
export function composeSession(input: ComposeInput): SessionPlan {
  const prep = prepMinutes(input.minutes);
  const budgetSeconds = Math.max(0, input.minutes * 60 - prep * 60);
  const studied = input.studiedGroups ?? new Set<string>();
  const taken = new Set<string>();
  const deferredSiblings: string[] = [];
  const eligible: ReviewCandidate[] = [];
  for (const card of [...input.reviews].sort(byPriority)) {
    const group = card.siblingGroupId;
    if (group === null) {
      eligible.push(card);
    } else if (studied.has(group) || taken.has(group)) {
      deferredSiblings.push(card.cardId);
    } else {
      taken.add(group);
      eligible.push(card);
    }
  }
  const reviews: string[] = [];
  const relearning: string[] = [];
  const forced: string[] = [];
  const postponed: { cardId: string; reason: 'noFit' }[] = [];
  let usedSeconds = 0;
  for (const card of eligible) {
    const mustEnter = card.relearning === true || card.postponements >= MAX_POSTPONEMENTS;
    if (mustEnter || usedSeconds + input.reviewSeconds <= budgetSeconds) {
      reviews.push(card.cardId);
      usedSeconds += input.reviewSeconds;
      if (card.relearning === true) {
        relearning.push(card.cardId);
      } else if (mustEnter) {
        forced.push(card.cardId);
      }
    } else {
      postponed.push({ cardId: card.cardId, reason: 'noFit' });
    }
  }
  const leftSeconds = Math.max(0, budgetSeconds - usedSeconds);
  const newBudgetSeconds =
    Math.min(leftSeconds, NEW_SHARE * input.minutes * 60) * input.brake.factor;
  const fit = Math.floor(newBudgetSeconds / input.newCardSeconds + 1e-9);
  const count = Math.min(
    input.newCards.length,
    input.brake.maxCards === null ? fit : Math.min(fit, input.brake.maxCards),
  );
  const newCards = input.newCards.slice(0, count);
  const nothing = reviews.length === 0 && newCards.length === 0;
  return {
    minutes: input.minutes,
    prepMinutes: prep,
    reviews,
    relearning,
    forced,
    newCards,
    postponed,
    deferredSiblings,
    estimatedSeconds: nothing
      ? 0
      : prep * 60 + usedSeconds + newCards.length * input.newCardSeconds,
    toleranceMinutes: maintenanceQuotaMinutes(input.minutes),
  };
}
