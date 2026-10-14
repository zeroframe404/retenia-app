import type { Clock } from '../core/clock';
import { studyDayOf } from '../core/study-day';
import {
  type ChannelName,
  type ChannelRequest,
  type ChannelResponse,
  channels,
  isChannelName,
} from '../preload/contract';

export type Variant = 'prueba' | 'real';

export type Handlers = {
  [K in ChannelName]: (request: ChannelRequest<K>) => Promise<ChannelResponse<K>>;
};

export function createHandlers({ clock, variant }: { clock: Clock; variant: Variant }): Handlers {
  return {
    ping: async () => ({ message: 'pong', variant, today: studyDayOf(clock.now()) }),
  };
}

// Lo que corre del lado del principal al recibir un mensaje del puente: valida la petición
// antes de tocar nada y la respuesta antes de devolverla. Nunca registra el contenido.
export async function handleMessage(
  handlers: Handlers,
  channel: string,
  rawRequest: unknown,
): Promise<unknown> {
  if (!isChannelName(channel)) {
    throw new Error('Canal desconocido');
  }
  const schema = channels[channel];
  const request = schema.request.safeParse(rawRequest);
  if (!request.success) {
    throw new Error(`Petición rechazada en el canal «${channel}»`);
  }
  const response = schema.response.safeParse(await handlers[channel](request.data));
  if (!response.success) {
    throw new Error(`Respuesta rechazada en el canal «${channel}»`);
  }
  return response.data;
}
