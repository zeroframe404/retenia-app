import { type ChannelName, channels, type ReteniaApi } from './contract';

export type Invoke = (channel: ChannelName, request: unknown) => Promise<unknown>;

// Arma window.retenia recorriendo el contrato. Cada petición se valida antes de salir y
// cada respuesta antes de llegar a la ventana; lo inválido se rechaza con un error neutro.
export function buildApi(invoke: Invoke): ReteniaApi {
  const api: Record<string, (request: unknown) => Promise<unknown>> = {};
  for (const name of Object.keys(channels) as ChannelName[]) {
    const schema = channels[name];
    api[name] = async (request) => {
      const parsedRequest = schema.request.safeParse(request);
      if (!parsedRequest.success) {
        throw new Error(`Petición rechazada en el canal «${name}»`);
      }
      const response = schema.response.safeParse(await invoke(name, parsedRequest.data));
      if (!response.success) {
        throw new Error(`Respuesta rechazada en el canal «${name}»`);
      }
      return response.data;
    };
  }
  return api as ReteniaApi;
}
