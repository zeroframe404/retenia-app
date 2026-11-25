// El dominio (Fase 17, H-34 a H-36): de la evidencia (los intentos) a las decisiones. El estado de
// cada objetivo con su máquina de estados, la estimación interna de cada concepto, la frontera de
// los requisitos, el diagnóstico tras un fallo, la dificultad recurrente y el tipo de error. Reglas
// puras: sin pantalla, sin base y sin reloj. El progreso vive en el objetivo y en el concepto,
// nunca en cada tarjeta.

export {
  type Confusion,
  confusionOf,
  type Diagnosis,
  type DiagnosisAction,
  type DiagnosisInput,
  diagnoseFailure,
  type MissingRequirement,
} from './diagnosis';
export { type RecurringDifficulty, recurringDifficulty } from './difficulty';
export {
  addToEstimate,
  type Estimate,
  type EstimateAttempt,
  estimateBacking,
  estimateCounts,
  estimateMean,
  INITIAL_ESTIMATE,
  weightOf,
} from './estimate';
export { MISTAKE_TYPES, type MistakeInput, type MistakeType, mistakeTypeOf } from './mistakes';
export { conceptKeyOf, parseObjectiveText } from './objective-text';
export {
  blocks,
  type Frontier,
  type FrontierObjective,
  foldRequirements,
  frontier,
  isMet,
  type Requirement,
  type RequirementEvent,
  type RequirementKind,
  type RequirementStatus,
  wouldCreateCycle,
} from './requirements';
export {
  type Column,
  DELAY_DAYS,
  isUnaided,
  type MasteryResult,
  type MasteryStep,
  type NextStep,
  nextStepOf,
  outcomeOf,
  plusDays,
  projectMastery,
  type StepReason,
} from './state';
export type {
  KnowAlready,
  MasteryAttempt,
  MasteryEvent,
  MasteryState,
  ObjectiveKind,
  Outcome,
} from './types';
