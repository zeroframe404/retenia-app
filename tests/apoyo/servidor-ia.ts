import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// El servidor de la IA en la PC (Fase 19; doble de la frontera «Red», declarado en
// docs/plan-de-pruebas.md §4): contesta como la API de Anthropic en 127.0.0.1, con respuestas
// grabadas, y anota lo que recibe. La variante de prueba de Retenia le manda los pedidos cuando
// arranca con RETENIA_IA_ORIGEN: así la punta a punta recorre el camino de tu clave (el adaptador de
// Anthropic con el SDK de verdad, el permiso, el costo, «Qué se envió», el tope) sin llamar a la IA
// real ni gastar. Las pruebas que lo usan lo dicen con «(simulado)».

export interface FakeAiRequest {
  readonly method: string;
  readonly path: string;
  readonly apiKey: string | null;
  readonly body: unknown;
}

export interface FakeAi {
  readonly origin: string;
  readonly requests: FakeAiRequest[];
  // Lo que contesta el próximo pedido de una explicación (si no hay nada, una válida).
  readonly replies: { status: number; body: unknown }[];
  close(): Promise<void>;
}

// Una explicación que cita la primera oración del pasaje, con 1.000 unidades de entrada y 500 de
// salida: con Opus 5.5, USD 0,014 («USD 0,01»).
function explanationFor(body: unknown): unknown {
  const user = (body as { messages?: { content?: unknown }[] }).messages?.[0]?.content;
  const passage = /<fragmento[^>]*>\n([\s\S]*)\n<\/fragmento>/u.exec(String(user ?? ''))?.[1] ?? '';
  const sentence = passage
    .split(/(?<=[.!?])\s+/u)
    .map((piece) => piece.trim())
    .find((piece) => piece.split(/\s+/u).length >= 3);
  const text = JSON.stringify({
    fromMaterial: sentence
      ? [{ quote: sentence, explanation: 'Es la idea central del pasaje.' }]
      : [],
    modelContribution: ['Un ejemplo ayuda a fijarla.'],
  });
  return {
    id: 'msg_servidor_de_prueba',
    type: 'message',
    role: 'assistant',
    model: (body as { model?: string }).model ?? 'claude-opus-5-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

export async function startFakeAi({ key }: { key: string }): Promise<FakeAi> {
  const requests: FakeAiRequest[] = [];
  const replies: { status: number; body: unknown }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: unknown = null;
      try {
        body = raw === '' ? null : JSON.parse(raw);
      } catch {
        body = raw;
      }
      const apiKey = request.headers['x-api-key'];
      const path = (request.url ?? '').split('?')[0] ?? '';
      requests.push({
        method: request.method ?? '',
        path,
        apiKey: typeof apiKey === 'string' ? apiKey : null,
        body,
      });
      const send = (status: number, payload: unknown) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(payload));
      };
      if (apiKey !== key) {
        send(401, { type: 'error', error: { type: 'authentication_error', message: 'clave' } });
        return;
      }
      const model = /^\/v1\/models\/([\w.-]+)$/u.exec(path);
      if (request.method === 'GET' && model) {
        send(200, {
          type: 'model',
          id: model[1],
          display_name: 'Modelo de prueba',
          created_at: '2026-01-01T00:00:00Z',
        });
        return;
      }
      if (request.method === 'POST' && path === '/v1/messages') {
        const reply = replies.shift();
        send(reply?.status ?? 200, reply?.body ?? explanationFor(body));
        return;
      }
      send(404, { type: 'error', error: { type: 'not_found_error', message: 'no existe' } });
    });
  });
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    replies,
    close: () => new Promise((closed) => server.close(() => closed())),
  };
}
