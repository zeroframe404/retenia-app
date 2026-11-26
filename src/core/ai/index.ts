// Las reglas puras de la compuerta de IA (Fase 19): sin red, sin base y sin pantalla.

export type { CapState } from './cap';
export {
  capState,
  DEFAULT_CAP_CENTS,
  fitsUnderCap,
  monthBounds,
  monthOf,
  percentUsed,
} from './cap';
export { locateQuote } from './citations';
export type { ModelPrice, Usage } from './cost';
export { costMicros, maxCostMicros } from './cost';
export type { AiFunctionState } from './functions';
export { functionState, retiresSoon } from './functions';
export type {
  BlockReason,
  PermissionChoice,
  PermissionScope,
  ProviderReach,
  RequestDecision,
  RequestFacts,
} from './gate-rules';
export { decideRequest } from './gate-rules';
export type { ConsequenceLevel } from './levels';
export { deliveryFor } from './levels';
export { numbersAgree, numbersIn } from './numbers';
