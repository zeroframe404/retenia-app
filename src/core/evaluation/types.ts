import type { ProblemType } from '../interleave';
import type { HelpLevel } from '../memory';
import type { Procedure } from '../procedure/steps';
import type { VariantFamily } from '../variants/family';

// Los tipos de actividad de la Fase 16 (H-31): todo lo que no es la tarjeta de siempre («me
// califico») se corrige con una regla de Retenia o marcando las unidades de idea.

export type ActivityType =
  | 'short'
  | 'numeric'
  | 'options'
  | 'order'
  | 'open'
  // Fase 18: el procedimiento por pasos, «¿Qué método usarías?» y el conjunto intercalado.
  | 'procedure'
  | 'decision'
  | 'interleaved';

export interface OptionItem {
  readonly id: string;
  readonly text: string;
  readonly correct: boolean;
  // Por qué esa no era (vacía en la correcta).
  readonly explanation: string;
}

interface StepItem {
  readonly id: string;
  readonly text: string;
}

interface UnitItem {
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
      // Fase 18: con familia de variantes, la respuesta de cada una sale de la fórmula (`value` es
      // la de la primera).
      readonly family?: VariantFamily | null | undefined;
      readonly formula?: string | null | undefined;
    }
  | { readonly type: 'options'; readonly options: readonly OptionItem[] }
  | {
      readonly type: 'order';
      // En el orden correcto.
      readonly steps: readonly StepItem[];
      // Otros órdenes que también valen («Mi respuesta era correcta»).
      readonly acceptedOrders: readonly (readonly string[])[];
    }
  | { readonly type: 'open'; readonly units: readonly UnitItem[] }
  | Procedure
  // «¿Qué método usarías? No lo resuelvas»: de 2 a 5 métodos, cada uno con su porqué.
  | { readonly type: 'decision'; readonly options: readonly OptionItem[] }
  // De 2 a 5 tipos de problema que se confunden, cada uno con sus ejercicios.
  | { readonly type: 'interleaved'; readonly types: readonly ProblemType[] };

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
