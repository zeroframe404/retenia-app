import Anthropic from '@anthropic-ai/sdk';
import {
  type AiProvider,
  AiProviderError,
  type CompletionRequest,
  type CompletionResponse,
  type ProviderErrorKind,
} from '../provider';

// El proveedor de Anthropic con el SDK oficial (Fase 19). Todo pedido sale por la puerta única a
// internet (`fetch`: con «Simular sin conexión» o «Modo solo local» falla sin mandar nada) y sin
// reintentos propios: los reintentos los decide la cola, con su tope de 3, y cada envío queda en
// «Qué se envió». El modelo es el fijado para cada función: no hay respaldo automático a otro.
// La clave viaja solo en su cabecera; este archivo no la guarda ni la anota en ningún lado.

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 90_000;
const ANTHROPIC_ORIGIN = 'https://api.anthropic.com';

function kindOfStatus(status: number): ProviderErrorKind {
  if (status === 401) {
    return 'auth';
  }
  if (status === 402) {
    return 'billing';
  }
  if (status === 403 || status === 404) {
    return 'model_unavailable';
  }
  if (status === 429 || status === 529) {
    return 'busy';
  }
  return status >= 500 ? 'server' : 'bad_request';
}

// La puerta única (src/main/net-gate.ts) falla con `OfflineError` (o `LocalOnlyError`) antes de
// mandar nada. El SDK la envuelve; se busca en la cadena de causas, por nombre (esta carpeta no
// importa del principal).
function closedGate(error: unknown): boolean {
  let cause: unknown = error;
  for (let depth = 0; depth < 5 && cause instanceof Error; depth++) {
    if (cause.name === 'OfflineError' || cause.name === 'LocalOnlyError') {
      return true;
    }
    cause = cause.cause;
  }
  return false;
}

function translate(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) {
    return error;
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiProviderError('timeout');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    // Si la puerta única de la PC no lo dejó salir, no salió nada: «sin conexión». Cualquier otro
    // corte (la conexión que se cae mientras la IA piensa, un proxy que la cierra) pudo pasar
    // después de mandar el pedido: no se sabe si llegó.
    return closedGate(error) ? new AiProviderError('offline') : new AiProviderError('connection');
  }
  if (error instanceof Anthropic.APIError && typeof error.status === 'number') {
    return new AiProviderError(kindOfStatus(error.status), error.status);
  }
  return new AiProviderError('server');
}

function stopReasonOf(reason: string | null | undefined): CompletionResponse['stopReason'] {
  return reason === 'end_turn' || reason === 'max_tokens' || reason === 'refusal'
    ? reason
    : 'other';
}

export function createAnthropicProvider({
  apiKey,
  fetch,
  baseURL,
}: {
  apiKey: string;
  fetch: Fetch;
  // Solo la variante de prueba lo usa: el servidor de la IA en la PC (127.0.0.1).
  baseURL?: string;
}): AiProvider {
  // Todo explícito: el SDK, si no, lee variables del entorno de Windows (ANTHROPIC_BASE_URL,
  // ANTHROPIC_AUTH_TOKEN, ANTHROPIC_LOG) que podrían mandar la clave a otra dirección, sumar otra
  // credencial o anotar los pedidos en la consola.
  const client = new Anthropic({
    apiKey,
    authToken: null,
    baseURL: baseURL ?? ANTHROPIC_ORIGIN,
    fetch,
    maxRetries: 0,
    timeout: TIMEOUT_MS,
    logLevel: 'off',
  });
  return {
    id: 'anthropic',
    kind: 'remote',
    variant: () => 'real',
    async testConnection(model) {
      try {
        await client.models.retrieve(model);
      } catch (error) {
        throw translate(error);
      }
    },
    async complete(request: CompletionRequest): Promise<CompletionResponse> {
      try {
        const message = await client.messages.create({
          model: request.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
          output_config: {
            effort: request.effort,
            format: { type: 'json_schema', schema: request.schema },
          },
        });
        const text = message.content
          .flatMap((block) => (block.type === 'text' ? [block.text] : []))
          .join('');
        return {
          text: text === '' ? null : text,
          usage: {
            inputTokens: message.usage.input_tokens,
            outputTokens: message.usage.output_tokens,
            cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
            cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
          },
          stopReason: stopReasonOf(message.stop_reason),
        };
      } catch (error) {
        throw translate(error);
      }
    },
  };
}
