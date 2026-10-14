import type { z } from 'zod';
import { pingRequest, pingResponse } from './ping';

// El contrato del puente: por cada canal, el esquema de la petición y el de la respuesta.
// El puente y el proceso principal se arman recorriendo este mapa; no hay listas a mano.
export const channels = {
  ping: { request: pingRequest, response: pingResponse },
};

type Channels = typeof channels;
export type ChannelName = keyof Channels;
export type ChannelRequest<K extends ChannelName> = z.input<Channels[K]['request']>;
export type ChannelResponse<K extends ChannelName> = z.output<Channels[K]['response']>;

export type ReteniaApi = {
  [K in ChannelName]: (request: ChannelRequest<K>) => Promise<ChannelResponse<K>>;
};

export function isChannelName(name: string): name is ChannelName {
  return Object.hasOwn(channels, name);
}
