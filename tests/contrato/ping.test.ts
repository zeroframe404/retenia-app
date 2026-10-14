import { describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { createHandlers, handleMessage } from '../../src/main/bridge';
import { buildApi } from '../../src/preload/api';

// El puente armado con el manejador real del principal, sin ventana: lo que pasa entre los
// dos lados es exactamente lo que pasaría por ipcRenderer.invoke.
const handlers = createHandlers({ clock: demoClock(), variant: 'prueba' });
const api = buildApi((channel, request) => handleMessage(handlers, channel, request));

describe('contrato del puente: canal «ping»', () => {
  it('responde pong con la variante y el día de estudio del reloj de demostración', async () => {
    await expect(api.ping({ message: 'ping' })).resolves.toEqual({
      message: 'pong',
      variant: 'prueba',
      today: '2027-03-15',
    });
  });

  it('el puente rechaza una petición que no cumple el esquema, antes de mandarla', async () => {
    const sent: unknown[] = [];
    const spy = buildApi(async (channel, request) => {
      sent.push(request);
      return handleMessage(handlers, channel, request);
    });
    const invalid = { message: 'pong' } as unknown as { message: 'ping' };
    await expect(spy.ping(invalid)).rejects.toThrow('Petición rechazada en el canal «ping»');
    const extra = { message: 'ping', extra: 1 } as unknown as { message: 'ping' };
    await expect(spy.ping(extra)).rejects.toThrow('Petición rechazada');
    expect(sent).toEqual([]);
  });

  it('el principal rechaza una petición inválida o un canal desconocido sin tocar nada', async () => {
    await expect(handleMessage(handlers, 'ping', 'ping')).rejects.toThrow('Petición rechazada');
    await expect(handleMessage(handlers, 'ping', null)).rejects.toThrow('Petición rechazada');
    await expect(handleMessage(handlers, 'settings.get', {})).rejects.toThrow('Canal desconocido');
    await expect(handleMessage(handlers, 'constructor', {})).rejects.toThrow('Canal desconocido');
  });

  it('una respuesta que no cumple el esquema no llega a la ventana', async () => {
    const broken = buildApi(async () => ({
      message: 'pong',
      variant: 'prueba',
      today: '15/03/2027',
    }));
    await expect(broken.ping({ message: 'ping' })).rejects.toThrow('Respuesta rechazada');
    const wrong = { ping: async () => ({ message: 'pong', variant: 'otra', today: '2027-03-15' }) };
    await expect(
      handleMessage(wrong as unknown as typeof handlers, 'ping', { message: 'ping' }),
    ).rejects.toThrow('Respuesta rechazada');
  });
});
