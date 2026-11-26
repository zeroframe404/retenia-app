import type { Usage } from '../core/ai';

// La interfaz de un proveedor de IA (Fase 19). La compuerta habla solo con esto: hoy está Anthropic
// (providers/anthropic.ts) y la IA simulada (adapters/recorded.ts); sumar otro proveedor es un
// archivo nuevo que cumple esta interfaz, sin tocar el resto.

// `remote`: manda datos fuera de la PC y gasta (pide permiso, suma al tope, queda en «Qué se
// envió»). `local`: la IA simulada de la demostración, que no saca nada de la PC.
export type ProviderKind = 'remote' | 'local';

export interface CompletionRequest {
  readonly model: string;
  readonly system: string;
  readonly user: string;
  // El esquema JSON de la salida, en la forma que acepta la API (schema-api.ts).
  readonly schema: Record<string, unknown>;
  readonly maxTokens: number;
  readonly effort: 'low' | 'medium' | 'high';
}

export interface CompletionResponse {
  // El texto que devolvió el modelo (nulo si no devolvió texto).
  readonly text: string | null;
  readonly usage: Usage;
  readonly stopReason: 'end_turn' | 'max_tokens' | 'refusal' | 'other';
}

// Lo que puede fallar, dicho como lo que es: un fallo técnico nunca se muestra como una duda del
// modelo. `offline`: no salió nada de la PC.
export type ProviderErrorKind =
  | 'offline'
  | 'auth'
  | 'billing'
  | 'busy'
  | 'server'
  | 'timeout'
  | 'bad_request'
  | 'model_unavailable';

export class AiProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status: number | null;

  constructor(kind: ProviderErrorKind, status: number | null = null) {
    super(`La IA no respondió (${kind})`);
    this.name = 'AiProviderError';
    this.kind = kind;
    this.status = status;
  }
}

export interface AiProvider {
  readonly id: string;
  readonly kind: ProviderKind;
  // Lo que separa respuestas distintas de un mismo proveedor (por ejemplo, la IA simulada cuando
  // responde mal): entra en la huella de lo guardado.
  variant(): string;
  testConnection(model: string): Promise<void>;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}
