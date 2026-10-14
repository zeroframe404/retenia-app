import type { z } from 'zod';
import { appInfoRequest, appInfoResponse } from './app';
import {
  cardHistorySchema,
  cardIdRequest,
  cardSchema,
  cardsCreateRequest,
  cardsEditRequest,
  cardsListRequest,
  cardsListResponse,
  cardsReviewRequest,
} from './cards';
import type { demoChannels } from './demo';
import { pingRequest, pingResponse } from './ping';

// El contrato del puente: por cada canal, el esquema de la petición y el de la respuesta.
// El puente y el proceso principal se arman recorriendo este mapa; no hay listas a mano.
// Los canales de demostración (`demo.*`) no están acá: los suma solo la variante de prueba.
export const channels = {
  ping: { request: pingRequest, response: pingResponse },
  'app.info': { request: appInfoRequest, response: appInfoResponse },
  'cards.create': { request: cardsCreateRequest, response: cardSchema },
  'cards.list': { request: cardsListRequest, response: cardsListResponse },
  'cards.review': { request: cardsReviewRequest, response: cardSchema },
  'cards.edit': { request: cardsEditRequest, response: cardSchema },
  'cards.history': { request: cardIdRequest, response: cardHistorySchema },
};

export type Registry = Readonly<Record<string, { request: z.ZodType; response: z.ZodType }>>;

type Channels = typeof channels;
export type ChannelName = keyof Channels;
type DemoRegistry = ReturnType<typeof demoChannels>;

// Lo que ve el manejador del principal (la petición ya validada) y lo que devuelve (antes
// de validar la respuesta).
export type HandlerRequest<K extends ChannelName> = z.output<Channels[K]['request']>;
export type HandlerResponse<K extends ChannelName> = z.input<Channels[K]['response']>;

export type ApiOf<R extends Registry> = {
  [K in keyof R]: (request: z.input<R[K]['request']>) => Promise<z.output<R[K]['response']>>;
};
export type ReteniaApi = ApiOf<Channels> & ApiOf<DemoRegistry>;
