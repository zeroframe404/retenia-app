import type { HelpLevel, Verdict } from '../memory';

// Los tipos de actividad de la Fase 16 (H-31): todo lo que no es la tarjeta de siempre («me
// califico») se corrige con una regla de Retenia o marcando las unidades de idea.

export type ActivityType = 'short' | 'numeric' | 'options' | 'order' | 'open';

export interface OptionItem {
  readonly id: string;
  readonly text: string;
  readonly correct: boolean;
  // Por qué esa no era (vacía en la correcta).
  readonly explanation: string;
}

export interface StepItem {
  readonly id: string;
  readonly text: string;
}

export interface UnitItem {
  readonly id: string;
  readonly text: string;
}

// Lo propio de cada tipo. La respuesta corta usa la respuesta y las variantes de la ficha; la
// numérica, además, las variantes como valores aceptados.
export type Activity =
  | { readonly type: 'short' }
  | {
      readonly type: 'numeric';
      readonly value: number;
      readonly tolerance: number;
      readonly unit: string | null;
    }
  | { readonly type: 'options'; readonly options: readonly OptionItem[] }
  | {
      readonly type: 'order';
      // En el orden correcto.
      readonly steps: readonly StepItem[];
      // Otros órdenes que también valen («Mi respuesta era correcta»).
      readonly acceptedOrders: readonly (readonly string[])[];
    }
  | { readonly type: 'open'; readonly units: readonly UnitItem[] };

// Una ayuda usada: qué fue, su nivel en la escala única y, si es una pista, cuál.
export type HelpKind = 'hint' | 'example' | 'source' | 'solution';

export interface HelpUse {
  readonly kind: HelpKind;
  readonly level: HelpLevel;
  readonly index?: number | undefined;
  // A los cuántos milisegundos de mostrarse la actividad se pidió.
  readonly atMs?: number | undefined;
}

// «práctica» o «evaluación» (la propiedad de la actividad, tarea 9).
export type ActivityMode = 'practice' | 'evaluation';

export type { HelpLevel, Verdict };
