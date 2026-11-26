import { fitsUnderCap } from './cap';
import type { AiFunctionState } from './functions';

// El orden de los controles de un pedido a la IA (Fase 19, docs/arquitectura.md §9). Nada se arma
// ni se manda si un control lo frena:
// 1. la función suspendida; 2. «Modo solo local» (CA-170), antes que todo lo demás; 3. sin IA
// conectada (CA-167); 4. un pasaje demasiado largo; 5. el tope del mes (CA-169), que frena también
// lo guardado; 6. lo ya preguntado, que se muestra sin preguntar el permiso (no sale nada de la PC);
// 7. el permiso del material (CA-172); 8. recién ahí se manda.
// La IA simulada de la demostración (`local`) no saca nada de la PC ni gasta: no pregunta el
// permiso ni mira el tope.

export type ProviderReach = 'none' | 'remote' | 'local';
export type PermissionScope = 'always' | 'never';
export type PermissionChoice = 'once' | 'always' | 'never';

export type BlockReason =
  | 'suspended'
  | 'local_only'
  | 'not_connected'
  | 'too_long'
  | 'cap_reached'
  | 'permission_denied';

export interface RequestFacts {
  readonly functionState: AiFunctionState;
  readonly localOnly: boolean;
  readonly provider: ProviderReach;
  readonly fragmentChars: number;
  readonly maxChars: number;
  readonly spentMicros: number;
  readonly capCents: number;
  // Lo máximo que puede costar este pedido.
  readonly nextMaxMicros: number;
  readonly cached: boolean;
  // Lo que decidiste antes para este material (nulo: nunca fue a la IA).
  readonly permission: PermissionScope | null;
  // Lo que elegiste ahora en la pregunta del permiso (nulo: todavía no se preguntó).
  readonly choice: PermissionChoice | null;
}

export type RequestDecision =
  | { readonly action: 'block'; readonly reason: BlockReason }
  | { readonly action: 'serve_cache' }
  | { readonly action: 'ask_permission' }
  | { readonly action: 'send' };

const block = (reason: BlockReason): RequestDecision => ({ action: 'block', reason });

export function decideRequest(facts: RequestFacts): RequestDecision {
  if (facts.functionState === 'suspended') {
    return block('suspended');
  }
  if (facts.localOnly) {
    return block('local_only');
  }
  if (facts.provider === 'none') {
    return block('not_connected');
  }
  if (facts.fragmentChars > facts.maxChars) {
    return block('too_long');
  }
  const remote = facts.provider === 'remote';
  if (remote && !fitsUnderCap(facts.spentMicros, facts.capCents, facts.nextMaxMicros)) {
    return block('cap_reached');
  }
  if (facts.cached) {
    return { action: 'serve_cache' };
  }
  if (!remote) {
    return { action: 'send' };
  }
  if (facts.choice === 'never') {
    return block('permission_denied');
  }
  if (facts.choice !== null) {
    return { action: 'send' };
  }
  if (facts.permission === 'never') {
    return block('permission_denied');
  }
  return facts.permission === 'always' ? { action: 'send' } : { action: 'ask_permission' };
}
