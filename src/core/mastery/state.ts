import { inCanonicalOrder } from '../ledger';
import { daysBetween } from '../memory';
import type { MasteryAttempt, MasteryEvent, MasteryState, Outcome } from './types';

// La máquina de estados de dominio (H-34; docs/especificacion/decisiones-conciliadas.md, sección
// 5). Recibe la evidencia de un objetivo en cualquier orden y la recorre en el orden de registro.
//
// - Solo cuenta el primer intento de cada día de estudio en cualquiera de las actividades del
//   objetivo; los demás quedan anotados («sameDay»). Un día anterior al último que contó (un reloj
//   atrasado) tampoco cuenta.
// - Sin ayuda es A0 o A1 (la pregunta orientadora), fuera de una pregunta de opciones. Con pista
//   de concepto o de paso, o con opciones (el azar), un acierto es «Con ayuda»: hace pasar de «Sin
//   iniciar» a «En práctica» y nada más. Un acierto con la solución a la vista (A4) es un fallo,
//   como para el motor de memoria.
// - «Suficiente para avanzar»: 2 aciertos sin ayuda en días distintos (o uno, desde «A revisar»).
// - «Consolidado»: 3 aciertos sin ayuda en días distintos, al menos uno con 7 días o más desde la
//   práctica anterior, contados desde el último fallo que bajó el estado. En un objetivo de tipo
//   «Aplicar», además uno en una variante nueva (CA-165, Fase 18).
// - Un fallo desde «Suficiente» o «Consolidado» lleva a «A revisar»; nunca a «Sin iniciar».
// - «Ya lo sé» desde «Sin iniciar»: «Suficiente para avanzar (por verificar)». Un acierto sin ayuda
//   de un día posterior quita la marca; un fallo lleva a «En práctica».

// Días desde la práctica anterior para que un acierto cuente como demorado («Diferido»).
const DELAY_DAYS = 7;

interface Column {
  readonly count: number;
  readonly lastDay: string | null;
}

type StepReason = 'counted' | 'sameDay' | 'earlier' | 'notValid' | 'notApplicable';

interface MasteryStep {
  readonly id: string;
  readonly studyDay: string;
  readonly counted: boolean;
  readonly reason: StepReason;
  readonly state: MasteryState;
}

export interface MasteryResult {
  readonly state: MasteryState;
  readonly toVerify: boolean;
  // Desde qué día se puede hacer la comprobación de «Ya lo sé» (nula si no hay ninguna pendiente).
  readonly pendingCheckFrom: string | null;
  readonly columns: {
    readonly unaided: Column;
    readonly aided: Column;
    readonly delayed: Column;
    readonly variants: Column;
  };
  // Aciertos sin ayuda (en días distintos) desde el último fallo que bajó el estado, y si alguno
  // fue demorado: lo que mira «Consolidado».
  readonly sinceFall: { readonly days: number; readonly delayed: boolean };
  // En «Aplicar», todavía falta el acierto sin ayuda en una variante nueva.
  readonly needsVariant?: boolean | undefined;
  readonly lastPracticeDay: string | null;
  readonly steps: readonly MasteryStep[];
}

export function outcomeOf(attempt: Pick<MasteryAttempt, 'verdict' | 'helpLevel'>): Outcome {
  if (attempt.verdict === 'incorrect' || attempt.helpLevel === 'A4') {
    return 'failure';
  }
  return attempt.verdict === 'partial' ? 'partial' : 'success';
}

function isUnaided(attempt: Pick<MasteryAttempt, 'helpLevel' | 'optionsQuestion'>): boolean {
  return (attempt.helpLevel === 'A0' || attempt.helpLevel === 'A1') && !attempt.optionsQuestion;
}

interface Counter {
  count: number;
  lastDay: string | null;
}

const bump = (counter: Counter, day: string) => {
  counter.count += 1;
  counter.lastDay = day;
};

// Un día de estudio (AAAA-MM-DD) más N días, sin pasar por la hora local.
const plusDays = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export function projectMastery(
  events: readonly MasteryEvent[],
  { needsVariant = false }: { needsVariant?: boolean | undefined } = {},
): MasteryResult {
  let state: MasteryState = 'not-started';
  // Desde qué día vale la comprobación de «Ya lo sé» (nula si no hay marca «(por verificar)»).
  let checkFrom: string | null = null;
  let lastCountedDay: string | null = null;
  let lastPracticeDay: string | null = null;
  let unaidedDays = 0;
  let sinceFallDays = 0;
  let sinceFallDelayed = false;
  let sinceFallVariant = false;
  const unaided: Counter = { count: 0, lastDay: null };
  const aided: Counter = { count: 0, lastDay: null };
  const delayed: Counter = { count: 0, lastDay: null };
  const variants: Counter = { count: 0, lastDay: null };
  const steps: MasteryStep[] = [];

  // Un fallo que baja el estado (o el de la comprobación de «Ya lo sé»): se saca la marca y
  // «Consolidado» vuelve a contar desde acá.
  const afterFall = () => {
    checkFrom = null;
    sinceFallDays = 0;
    sinceFallDelayed = false;
    sinceFallVariant = false;
  };

  for (const event of inCanonicalOrder(events)) {
    const step = (counted: boolean, reason: StepReason) =>
      steps.push({ id: event.id, studyDay: event.studyDay, counted, reason, state });
    if (event.kind === 'knowAlready') {
      if (state === 'not-started') {
        state = 'enough';
        checkFrom = plusDays(event.studyDay, 1);
        step(true, 'counted');
      } else {
        step(false, 'notApplicable');
      }
      continue;
    }
    if (!event.valid) {
      step(false, 'notValid');
      continue;
    }
    if (lastCountedDay !== null && event.studyDay <= lastCountedDay) {
      step(false, event.studyDay === lastCountedDay ? 'sameDay' : 'earlier');
      continue;
    }
    lastCountedDay = event.studyDay;
    const gap = lastPracticeDay === null ? null : daysBetween(event.studyDay, lastPracticeDay);
    const outcome = outcomeOf(event);
    if (outcome === 'failure') {
      if (checkFrom !== null) {
        state = 'in-practice';
        afterFall();
      } else if (state === 'enough' || state === 'consolidated') {
        state = 'to-review';
        afterFall();
      } else if (state === 'not-started') {
        state = 'in-practice';
      }
    } else if (outcome === 'success' && isUnaided(event)) {
      const isDelayed = gap !== null && gap >= DELAY_DAYS;
      unaidedDays += 1;
      sinceFallDays += 1;
      sinceFallDelayed ||= isDelayed;
      bump(unaided, event.studyDay);
      if (isDelayed) {
        bump(delayed, event.studyDay);
      }
      if (event.newVariant === true) {
        sinceFallVariant = true;
        bump(variants, event.studyDay);
      }
      if (checkFrom !== null) {
        if (event.studyDay >= checkFrom) {
          checkFrom = null;
        }
      } else if (state === 'not-started' || state === 'in-practice') {
        state = unaidedDays >= 2 ? 'enough' : 'in-practice';
      } else if (state === 'to-review') {
        state = 'enough';
      } else if (
        state === 'enough' &&
        sinceFallDays >= 3 &&
        sinceFallDelayed &&
        (!needsVariant || sinceFallVariant)
      ) {
        state = 'consolidated';
      }
    } else {
      // Un acierto con ayuda o con opciones, o un «Vas bien.»: es práctica.
      if (outcome === 'success') {
        bump(aided, event.studyDay);
      }
      if (state === 'not-started') {
        state = 'in-practice';
      }
    }
    lastPracticeDay = event.studyDay;
    step(true, 'counted');
  }

  return {
    state,
    toVerify: checkFrom !== null,
    pendingCheckFrom: checkFrom,
    columns: {
      unaided: { ...unaided },
      aided: { ...aided },
      delayed: { ...delayed },
      variants: { ...variants },
    },
    sinceFall: { days: sinceFallDays, delayed: sinceFallDelayed },
    ...(needsVariant && !sinceFallVariant ? { needsVariant: true } : {}),
    lastPracticeDay,
    steps,
  };
}

// Qué falta para el próximo estado, en claves (los textos están en el catálogo).
export type NextStep =
  | { readonly kind: 'start' }
  | { readonly kind: 'toEnough'; readonly remaining: number }
  | { readonly kind: 'recover' }
  | { readonly kind: 'check'; readonly from: string }
  | {
      readonly kind: 'toConsolidated';
      readonly remaining: number;
      // Desde qué día un acierto sin ayuda cuenta como demorado (nulo si ya hubo uno).
      readonly delayedFrom: string | null;
      readonly needsVariant?: boolean | undefined;
    }
  | { readonly kind: 'kept' };

export function nextStepOf(result: MasteryResult): NextStep {
  switch (result.state) {
    case 'not-started':
      return { kind: 'start' };
    case 'in-practice':
      return { kind: 'toEnough', remaining: Math.max(1, 2 - result.columns.unaided.count) };
    case 'to-review':
      return { kind: 'recover' };
    case 'consolidated':
      return { kind: 'kept' };
    case 'enough':
      if (result.pendingCheckFrom !== null) {
        return { kind: 'check', from: result.pendingCheckFrom };
      }
      // Sin la marca, a «Suficiente» se llegó con aciertos: hay una práctica anterior.
      return {
        kind: 'toConsolidated',
        // Con la variante pendiente, puede no faltar ningún día: solo ella.
        remaining: Math.max(result.needsVariant ? 0 : 1, 3 - result.sinceFall.days),
        delayedFrom: result.sinceFall.delayed
          ? null
          : plusDays(result.lastPracticeDay as string, DELAY_DAYS),
        ...(result.needsVariant ? { needsVariant: true } : {}),
      };
  }
}
