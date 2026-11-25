// El dominio (Fase 17, H-34 a H-36): de la evidencia (los intentos) a las decisiones. El estado de
// cada objetivo con su máquina de estados, la estimación interna de cada concepto, la frontera de
// los requisitos, el diagnóstico tras un fallo, la dificultad recurrente y el tipo de error. Reglas
// puras: sin pantalla, sin base y sin reloj. El progreso vive en el objetivo y en el concepto,
// nunca en cada tarjeta.

export {
  confusionOf,
  type Diagnosis,
  diagnoseFailure,
  type MissingRequirement,
} from './diagnosis';
export { type RecurringDifficulty, recurringDifficulty } from './difficulty';
export {
  addToEstimate,
  type Estimate,
  estimateBacking,
  estimateCounts,
  estimateMean,
  INITIAL_ESTIMATE,
} from './estimate';
export { type MistakeInput, type MistakeType, mistakeTypeOf } from './mistakes';
export { conceptKeyOf, conceptNameOf, parseObjectiveText } from './objective-text';
export {
  blocks,
  type Frontier,
  foldRequirements,
  frontier,
  isMet,
  type Requirement,
  type RequirementEvent,
  wouldCreateCycle,
} from './requirements';
export {
  type MasteryResult,
  nextStepOf,
  outcomeOf,
  projectMastery,
} from './state';
export type { MasteryEvent, MasteryState, ObjectiveKind } from './types';
