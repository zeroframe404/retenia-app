// La evaluación sin IA (Fase 16, H-31 a H-33): cómo se corrige cada tipo de actividad, la barra de
// ayuda con su escala única, qué le llega al motor y el resultado en tres líneas. Reglas puras: sin
// pantalla, sin base y sin reloj.

export { evaluateOptions, evaluateOrder, initialOrder, shuffledOptions } from './choices';
export {
  type HelpState,
  helpAvailability,
  helpLevelOf,
  maxHelpLevel,
  modeLabel,
  nextHint,
  purposeOf,
  topHelp,
} from './help';
export {
  evaluateNumeric,
  type NumericResult,
  type NumericSpec,
  type ParsedNumber,
  parseNumber,
} from './numeric';
export {
  type ActionKey,
  type CountedAttempt,
  engineSignal,
  hasPendingCheck,
  type ResultParts,
  type ReviewKey,
  resultParts,
  type VerdictKey,
} from './result';
export {
  type DiffStep,
  evaluateShort,
  letterDiff,
  normalizeShortAnswer,
  type ShortResult,
} from './short';
export type {
  Activity,
  ActivityMode,
  ActivityType,
  HelpKind,
  HelpUse,
  OptionItem,
  StepItem,
  UnitItem,
} from './types';
export {
  type ActivityProblem,
  MAX_STEPS,
  MAX_UNIT_LENGTH,
  MIN_STEPS,
  OPTIONS_COUNT,
  validateActivity,
} from './validate';
export { allowedVerdicts, canSetVerdict, MAX_UNITS, MIN_UNITS, verdictFromUnits } from './verdicts';
