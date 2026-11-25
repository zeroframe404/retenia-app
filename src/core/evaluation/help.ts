import type { HelpLevel } from '../memory';
import type { ActivityMode, HelpKind, HelpUse } from './types';

// La barra de ayuda (H-32) con la escala única: A1 pregunta orientadora, A2 pista de concepto, A3
// pista de paso o «Ver un ejemplo», A4 solución vista. «Fuente» cuenta como pista de concepto.
// Pedir ayuda nunca se bloquea por usarla mucho: se anota.

const HINT_LEVELS: readonly HelpLevel[] = ['A1', 'A2', 'A3'];
const RANK: Record<HelpLevel, number> = { A0: 0, A1: 1, A2: 2, A3: 3, A4: 4 };

export function helpLevelOf(help: { kind: HelpKind; index?: number | undefined }): HelpLevel {
  switch (help.kind) {
    case 'hint':
      return HINT_LEVELS[help.index ?? 0] ?? 'A3';
    case 'example':
      return 'A3';
    case 'source':
      return 'A2';
    case 'solution':
      return 'A4';
  }
}

export function maxHelpLevel(used: readonly HelpUse[]): HelpLevel {
  let top: HelpLevel = 'A0';
  for (const help of used) {
    if (RANK[help.level] > RANK[top]) {
      top = help.level;
    }
  }
  return top;
}

// La ayuda más alta que se usó (la última, si hay varias del mismo nivel).
export function topHelp(used: readonly HelpUse[]): HelpUse | null {
  let top: HelpUse | null = null;
  for (const help of used) {
    if (top === null || RANK[help.level] >= RANK[top.level]) {
      top = help;
    }
  }
  return top;
}

export interface HelpState {
  // Hay un intento empezado: algo escrito, una opción elegida, un paso movido o «No sé por dónde
  // empezar».
  readonly started: boolean;
  readonly submitted: boolean;
  readonly mode: ActivityMode;
  // Cuántas pistas trae la ficha (hasta 3, en orden).
  readonly hints: number;
  readonly hasExample: boolean;
  readonly hasSource: boolean;
  readonly used: readonly HelpUse[];
}

// Qué botones de la barra están prendidos (CA-135). En una evaluación no hay ninguna ayuda hasta
// enviar; después de enviar, la ayuda es «Explicación», del resultado.
export function helpAvailability(state: HelpState): {
  hint: boolean;
  example: boolean;
  source: boolean;
  noIdea: boolean;
} {
  if (state.mode === 'evaluation' || state.submitted) {
    return { hint: false, example: false, source: false, noIdea: false };
  }
  const on = state.started;
  return {
    hint: on,
    example: on && state.hasExample,
    source: on && state.hasSource,
    noIdea: !on,
  };
}

// Lo que trae el próximo «Pista» (CA-136): la siguiente pista de la ficha, en orden, o la pregunta
// antes de mostrar la solución.
export function nextHint(
  state: HelpState,
): { kind: 'hint'; index: number; level: HelpLevel } | { kind: 'confirmSolution' } {
  const index = state.used.filter((help) => help.kind === 'hint').length;
  const level = HINT_LEVELS[index];
  if (index >= state.hints || level === undefined) {
    return { kind: 'confirmSolution' };
  }
  return { kind: 'hint', index, level };
}

interface ModeInput {
  readonly mode: ActivityMode;
  readonly used: readonly HelpUse[];
  // 1 = el primer intento de esta apertura; «Reintentar» suma.
  readonly attemptNo: number;
}

// El rótulo de la actividad: «EVALUACIÓN» en el primer intento de una evaluación; si no,
// «PRÁCTICA CON AYUDA» desde la primera ayuda y «PRÁCTICA AUTÓNOMA» sin ayuda.
export function modeLabel(input: ModeInput): 'evaluation' | 'help' | 'autonomous' {
  if (input.mode === 'evaluation' && input.attemptNo === 1) {
    return 'evaluation';
  }
  return input.used.length > 0 ? 'help' : 'autonomous';
}

// El propósito que se guarda con el intento.
export function purposeOf(input: ModeInput): 'evaluation' | 'assisted' | 'autonomous' {
  const label = modeLabel(input);
  return label === 'help' ? 'assisted' : label;
}
