import type { Usage } from '../../core/ai';
import {
  type AiProvider,
  AiProviderError,
  type CompletionRequest,
  type CompletionResponse,
  type ProviderErrorKind,
  type ProviderKind,
} from '../provider';

export type { CompletionRequest } from '../provider';

// La IA simulada (Fase 19; el doble de la frontera «IA» de docs/plan-de-pruebas.md §4): contesta
// con respuestas grabadas, deterministas, sin clave, sin red y sin gastar. La usan toda la red de
// pruebas y la demostración (Ajustes › «Demostración» › «IA simulada»). Qué contesta lo decide
// quien la arma (`answer`): la demostración busca en sus grabaciones, las pruebas ponen las suyas.
// Respeta la conexión (sin conexión, falla como la de verdad) y puede tardar (`delayMs`, con el
// `sleep` que le pasen) o quedar frenada hasta que una prueba la suelte (`hold`).

export interface RecordedAnswer {
  readonly text?: string | null;
  readonly usage?: Partial<Usage>;
  readonly stopReason?: 'end_turn' | 'max_tokens' | 'refusal';
  readonly error?: ProviderErrorKind;
}

export interface RecordedProvider extends AiProvider {
  // Cada pedido que llegó, en orden.
  readonly calls: CompletionRequest[];
  // Que «Probar conexión» falle de esa forma (nulo: que ande).
  failConnection(kind: ProviderErrorKind | null): void;
}

const NO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export function createRecordedProvider({
  kind = 'local',
  answer,
  isOffline = () => false,
  delayMs = () => 0,
  sleep = (ms) => new Promise((wake) => setTimeout(wake, ms)),
  hold,
  variant = () => 'grabada',
}: {
  kind?: ProviderKind;
  answer: (request: CompletionRequest, index: number) => RecordedAnswer;
  isOffline?: () => boolean;
  delayMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  hold?: () => Promise<void>;
  variant?: () => string;
}): RecordedProvider {
  const calls: CompletionRequest[] = [];
  let connectionFailure: ProviderErrorKind | null = null;
  return {
    id: 'simulated',
    kind,
    calls,
    variant,
    failConnection(next) {
      connectionFailure = next;
    },
    async testConnection() {
      if (isOffline()) {
        throw new AiProviderError('offline');
      }
      if (connectionFailure !== null) {
        throw new AiProviderError(connectionFailure);
      }
    },
    async complete(request): Promise<CompletionResponse> {
      if (isOffline()) {
        throw new AiProviderError('offline');
      }
      const index = calls.length;
      calls.push(request);
      const wait = delayMs();
      if (wait > 0) {
        await sleep(wait);
      }
      if (hold) {
        await hold();
      }
      const recorded = answer(request, index);
      if (recorded.error) {
        throw new AiProviderError(recorded.error);
      }
      return {
        text: recorded.text ?? null,
        usage: { ...NO_USAGE, ...recorded.usage },
        stopReason: recorded.stopReason ?? 'end_turn',
      };
    },
  };
}
