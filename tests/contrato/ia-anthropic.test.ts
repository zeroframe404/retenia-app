import { describe, expect, it } from 'vitest';
import { AiProviderError } from '../../src/ai/provider';
import { createAnthropicProvider } from '../../src/ai/providers/anthropic';
import { OfflineError } from '../../src/main/net-gate';
import { TEST_KEY } from '../apoyo/caja-segura';

// El adaptador de Anthropic (Fase 19) con la red simulada (doble de la frontera «Red», declarado):
// el SDK oficial de verdad arma cada pedido y lee cada respuesta; lo único que cambia es el `fetch`,
// que anota lo que salió y contesta lo que pone la prueba. Así se prueba el camino de tu clave sin
// llamar a la IA real ni gastar.

interface Sent {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown> | null;
}

function fakeNetwork(reply: (sent: Sent) => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const entry: Sent = {
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body:
        typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    };
    sent.push(entry);
    return reply(entry);
  };
  return { sent, fetch };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const message = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg_prueba',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [
    { type: 'thinking', thinking: '', signature: 'x' },
    { type: 'text', text: '{"fromMaterial":[],"modelContribution":["Hola."]}' },
  ],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    input_tokens: 1200,
    output_tokens: 340,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  },
  ...overrides,
});

const REQUEST = {
  model: 'claude-opus-5-5',
  system: 'Instrucción fija.',
  user: '<fragmento material="a">Texto.</fragmento>',
  schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  maxTokens: 2000,
  effort: 'low' as const,
};

describe('adaptador de Anthropic (simulado: red)', () => {
  it('arma el pedido con el modelo fijado, la salida con esquema y la clave solo en su cabecera', async () => {
    const network = fakeNetwork(() => json(200, message()));
    const provider = createAnthropicProvider({ apiKey: TEST_KEY, fetch: network.fetch });
    const response = await provider.complete(REQUEST);
    expect(network.sent).toHaveLength(1);
    const [sent] = network.sent;
    expect(sent?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(sent?.method).toBe('POST');
    expect(sent?.headers.get('x-api-key')).toBe(TEST_KEY);
    expect(sent?.headers.get('anthropic-version')).toBeTruthy();
    expect(sent?.body).toEqual({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      system: 'Instrucción fija.',
      messages: [{ role: 'user', content: '<fragmento material="a">Texto.</fragmento>' }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: REQUEST.schema } },
    });
    expect(JSON.stringify(sent?.body)).not.toContain(TEST_KEY);
    expect(response).toEqual({
      text: '{"fromMaterial":[],"modelContribution":["Hola."]}',
      usage: { inputTokens: 1200, outputTokens: 340, cacheReadTokens: 0, cacheWriteTokens: 0 },
      stopReason: 'end_turn',
    });
    expect(provider.kind).toBe('remote');
  });

  it('una respuesta cortada por largo o rechazada se dice como tal', async () => {
    const cut = createAnthropicProvider({
      apiKey: TEST_KEY,
      fetch: fakeNetwork(() => json(200, message({ stop_reason: 'max_tokens' }))).fetch,
    });
    expect((await cut.complete(REQUEST)).stopReason).toBe('max_tokens');
    const refused = createAnthropicProvider({
      apiKey: TEST_KEY,
      fetch: fakeNetwork(() => json(200, message({ stop_reason: 'refusal', content: [] }))).fetch,
    });
    expect(await refused.complete(REQUEST)).toMatchObject({ text: null, stopReason: 'refusal' });
  });

  const failures: [number, string][] = [
    [400, 'bad_request'],
    [401, 'auth'],
    [402, 'billing'],
    [403, 'model_unavailable'],
    [404, 'model_unavailable'],
    [429, 'busy'],
    [500, 'server'],
    [529, 'busy'],
  ];

  it.for(failures)(
    'un %i de la IA es un error técnico «%s», y no se reintenta solo',
    async ([status, kind]) => {
      const network = fakeNetwork(() =>
        json(status, { type: 'error', error: { type: 'api_error', message: 'falla de prueba' } }),
      );
      const provider = createAnthropicProvider({ apiKey: TEST_KEY, fetch: network.fetch });
      const failure = await provider.complete(REQUEST).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(AiProviderError);
      expect((failure as AiProviderError).kind).toBe(kind);
      expect(network.sent).toHaveLength(1);
    },
  );

  it('sin conexión (la puerta única cerrada) es «sin conexión», no una duda del modelo', async () => {
    const provider = createAnthropicProvider({
      apiKey: TEST_KEY,
      fetch: () => Promise.reject(new OfflineError()),
    });
    const failure = await provider.complete(REQUEST).catch((error: unknown) => error);
    expect((failure as AiProviderError).kind).toBe('offline');
  });

  it('una conexión que se corta con la puerta abierta es un corte (el pedido pudo haber llegado), no «sin conexión» (simulado)', async () => {
    const provider = createAnthropicProvider({
      apiKey: TEST_KEY,
      fetch: () =>
        Promise.reject(new TypeError('fetch failed', { cause: new Error('other side closed') })),
    });
    const failure = await provider.complete(REQUEST).catch((error: unknown) => error);
    expect((failure as AiProviderError).kind).toBe('connection');
    expect((failure as AiProviderError).status).toBeNull();
  });

  it('«Probar conexión» pregunta por el modelo, que no cuesta nada', async () => {
    const network = fakeNetwork(() =>
      json(200, {
        type: 'model',
        id: 'claude-opus-5-5',
        display_name: 'Claude Opus 5.5',
        created_at: '2026-01-01T00:00:00Z',
      }),
    );
    const provider = createAnthropicProvider({ apiKey: TEST_KEY, fetch: network.fetch });
    await provider.testConnection('claude-opus-5-5');
    expect(network.sent).toMatchObject([
      { url: 'https://api.anthropic.com/v1/models/claude-opus-5-5', method: 'GET' },
    ]);
    const refused = createAnthropicProvider({
      apiKey: TEST_KEY,
      fetch: fakeNetwork(() =>
        json(401, { type: 'error', error: { type: 'authentication_error', message: 'x' } }),
      ).fetch,
    });
    await expect(refused.testConnection('claude-opus-5-5')).rejects.toMatchObject({ kind: 'auth' });
  });

  it('con otra dirección de origen (el servidor de la IA en la PC) va ahí', async () => {
    const network = fakeNetwork(() => json(200, message()));
    const provider = createAnthropicProvider({
      apiKey: TEST_KEY,
      fetch: network.fetch,
      baseURL: 'http://127.0.0.1:4555',
    });
    await provider.complete(REQUEST);
    expect(network.sent[0]?.url).toBe('http://127.0.0.1:4555/v1/messages');
  });
});
