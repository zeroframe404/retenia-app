import type { Clock } from '../core/clock';
import { studyDayOf } from '../core/study-day';
import type { CardsStore } from '../data/cards';
import {
  type ChannelName,
  channels,
  type HandlerRequest,
  type HandlerResponse,
  type Registry,
} from '../preload/contract';

export type Variant = 'prueba' | 'real';

export type Handlers = {
  [K in ChannelName]: (request: HandlerRequest<K>) => Promise<HandlerResponse<K>>;
};

export function createHandlers({
  clock,
  variant,
  cards,
  dataDir,
  version,
}: {
  clock: Clock;
  variant: Variant;
  cards: CardsStore;
  dataDir: string;
  version: string;
}): Handlers {
  return {
    ping: async () => ({ message: 'pong', variant, today: studyDayOf(clock.now()) }),
    'app.info': async () => ({ version, variant, dataDir }),
    'cards.create': async (request) => cards.create(request),
    'cards.list': async () => ({ cards: cards.list() }),
    'cards.review': async (request) => cards.review(request),
    'cards.edit': async (request) => cards.edit(request),
    'cards.history': async (request) => cards.history(request),
  };
}

type AnyHandlers = Readonly<Record<string, (request: never) => Promise<unknown>>>;

// Lo que corre del lado del principal al recibir un mensaje del puente: valida la petición
// antes de tocar nada y la respuesta antes de devolverla. Nunca registra el contenido.
// El registro de canales es el del contrato; la variante de prueba le suma los suyos.
export async function handleMessage(
  handlers: AnyHandlers,
  channel: string,
  rawRequest: unknown,
  registry: Registry = channels,
): Promise<unknown> {
  const schema = Object.hasOwn(registry, channel) ? registry[channel] : undefined;
  const handler = Object.hasOwn(handlers, channel) ? handlers[channel] : undefined;
  if (!schema || !handler) {
    throw new Error('Canal desconocido');
  }
  const request = schema.request.safeParse(rawRequest);
  if (!request.success) {
    throw new Error(`Petición rechazada en el canal «${channel}»`);
  }
  const response = schema.response.safeParse(await handler(request.data as never));
  if (!response.success) {
    throw new Error(`Respuesta rechazada en el canal «${channel}»`);
  }
  return response.data;
}
