import { inCanonicalOrder } from '../ledger';

// La escalera de apoyo de un procedimiento (CA-157 a CA-159): del ejemplo completo a la variante,
// con un paso más vacío cada vez. Sale del historial, así que se recuerda sola.
//
// - Solo cuenta el primer intento de cada día de estudio: el apoyo no se retira por aciertos de la
//   misma sesión.
// - 2 aciertos sin ayuda en días distintos retiran un escalón de apoyo (ver el ejemplo y explicar
//   el paso clave cuenta como acierto en el primer escalón). Un fallo borra lo juntado.
// - 2 fallos seguidos del mismo tipo (el primer paso mal) devuelven un escalón de apoyo; uno
//   aislado repite el escalón. Un acierto en el medio, aun con pista, corta la racha.
// - Cada intento cambia como mucho un escalón.

export type Rung =
  | { readonly kind: 'example' }
  | { readonly kind: 'blanks'; readonly count: number }
  | { readonly kind: 'whole' }
  | { readonly kind: 'variant' };

export function rungsOf(stepCount: number): Rung[] {
  return [
    { kind: 'example' },
    ...Array.from({ length: Math.max(0, stepCount - 1) }, (_, n) => ({
      kind: 'blanks' as const,
      count: n + 1,
    })),
    { kind: 'whole' },
    { kind: 'variant' },
  ];
}

// Qué pasos se completan en un escalón: siempre los últimos.
export function blankStepIds(rung: Rung, stepIds: readonly string[]): string[] {
  switch (rung.kind) {
    case 'example':
      return [];
    case 'blanks':
      return stepIds.slice(-rung.count);
    default:
      return [...stepIds];
  }
}

interface Dated {
  readonly id: string;
  readonly seq: number;
  readonly studyDay: string;
}

export type LadderEvent =
  // El ejemplo completo, visto y explicado.
  | (Dated & { readonly kind: 'studied' })
  | (Dated & {
      readonly kind: 'attempt';
      // El primer paso que no salió bien (nulo si salieron todos).
      readonly failedStep: string | null;
      // Con pistas de la barra de ayuda.
      readonly aided: boolean;
    });

// «less»: se retiró un escalón de apoyo. «more»: se sumó.
type SupportChange = 'less' | 'more';

interface LadderStep {
  readonly id: string;
  readonly studyDay: string;
  readonly counted: boolean;
  readonly change: SupportChange | null;
  readonly level: number;
}

export interface LadderResult {
  // El escalón de la próxima vez, desde 0 (el ejemplo completo).
  readonly level: number;
  readonly steps: readonly LadderStep[];
}

const DAYS_TO_REMOVE = 2;
const FAILS_TO_ADD = 2;

export function projectLadder(rungCount: number, events: readonly LadderEvent[]): LadderResult {
  const top = Math.max(0, rungCount - 1);
  let level = 0;
  let lastDay: string | null = null;
  let successDays = 0;
  let failure: { type: string; count: number } | null = null;
  const steps: LadderStep[] = [];

  for (const event of inCanonicalOrder(events)) {
    const counted = lastDay === null || event.studyDay > lastDay;
    let change: SupportChange | null = null;
    if (counted) {
      lastDay = event.studyDay;
      const failed = event.kind === 'attempt' ? event.failedStep : null;
      if (failed !== null) {
        successDays = 0;
        const count: number = failure?.type === failed ? failure.count + 1 : 1;
        failure = { type: failed, count };
        if (count >= FAILS_TO_ADD) {
          failure = null;
          if (level > 0) {
            level -= 1;
            change = 'more';
          }
        }
      } else {
        failure = null;
        if (event.kind === 'studied' || !event.aided) {
          successDays += 1;
          if (successDays >= DAYS_TO_REMOVE) {
            successDays = 0;
            if (level < top) {
              level += 1;
              change = 'less';
            }
          }
        }
      }
    }
    steps.push({ id: event.id, studyDay: event.studyDay, counted, change, level });
  }
  return { level, steps };
}
