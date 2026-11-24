// La evaluación sin IA (Fase 16, H-31 a H-33): cómo se corrige cada tipo de actividad, la barra de
// ayuda con su escala única, qué le llega al motor y el resultado en tres líneas. Reglas puras: sin
// pantalla, sin base y sin reloj.

export { evaluateOptions, evaluateOrder, initialOrder, shuffledOptions } from './choices';
export {
  helpAvailability,
  helpLevelOf,
  maxHelpLevel,
  modeLabel,
  nextHint,
  purposeOf,
} from './help';
export { evaluateNumeric, parseNumber } from './numeric';
export { engineSignal, hasPendingCheck, type ResultParts, resultParts } from './result';
export { evaluateShort, letterDiff, normalizeShortAnswer } from './short';
export type { Activity, ActivityType, HelpUse } from './types';
export { validateActivity } from './validate';
export { allowedVerdicts, canSetVerdict, verdictFromUnits } from './verdicts';
