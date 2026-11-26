import { afterEach, describe, expect, it } from 'vitest';
import { channels } from '../../src/preload/contract';
import { demoChannels } from '../../src/preload/contract/demo';
import { eventSchema } from '../../src/preload/contract/events';
import { TEST_KEY } from '../apoyo/caja-segura';
import { openBridge, type TestBridge } from '../apoyo/puente';

// Los canales de la IA (Fase 19): lo que la ventana puede pedir y lo que recibe. Ninguna respuesta
// trae la clave; ningún canal `ai.*` toca tarjetas, repasos ni dominio (eso lo mira además la
// prueba estática de la compuerta).

const bridges: TestBridge[] = [];
afterEach(() => {
  for (const bridge of bridges.splice(0)) {
    bridge.close();
  }
});

describe('contrato de la IA', () => {
  it('[CA-167] sin configurar nada, la IA está sin conectar, con el tope de USD 10 y sin gasto', async () => {
    const bridge = openBridge();
    bridges.push(bridge);
    expect(await bridge.api['ai.status']({})).toEqual({
      provider: 'none',
      keySaved: false,
      secureStorage: false,
      localOnly: false,
      capCents: 1000,
      spentMicros: 0,
      capState: 'ok',
      percentUsed: 0,
      functions: [{ id: 'explain_fragment', state: 'enabled' }],
    });
    expect((await bridge.api['ai.sentLog']({})).rows).toEqual([]);
  });

  it('[CA-168] la clave pegada tiene que ser una sola palabra de 20 a 400 caracteres', async () => {
    const bridge = openBridge();
    bridges.push(bridge);
    for (const key of ['corta', `${TEST_KEY} ${TEST_KEY}`, 'x'.repeat(401)]) {
      const failure = await bridge.api['ai.testConnection']({ key }).catch(
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      // El error nunca repite lo que se pegó.
      expect(String(failure)).not.toContain(key.slice(0, 8));
    }
  });

  it('[CA-168] sin almacén seguro (el puente de las pruebas no tiene uno), la clave no se guarda', async () => {
    const bridge = openBridge();
    bridges.push(bridge);
    expect((await bridge.api['ai.testConnection']({ key: TEST_KEY })).result).toBe('insecure');
  });

  it('[CA-169] el tope se fija de USD 0,01 a USD 1.000, en centavos', async () => {
    const bridge = openBridge();
    bridges.push(bridge);
    expect((await bridge.api['ai.setCap']({ capCents: 1 })).capCents).toBe(1);
    for (const capCents of [0, 100_001, 1.5]) {
      await expect(bridge.api['ai.setCap']({ capCents })).rejects.toThrow();
    }
  });

  it('[CA-174] los canales de la IA son estos y ninguno escribe en el aprendizaje', () => {
    const names = Object.keys(channels).filter((name) => name.startsWith('ai.'));
    expect(names.sort()).toEqual(
      [
        'ai.cancel',
        'ai.deleteKey',
        'ai.explain',
        'ai.outcome',
        'ai.permissions',
        'ai.revokePermission',
        'ai.sentLog',
        'ai.setCap',
        'ai.setFunctionState',
        'ai.setLocalOnly',
        'ai.status',
        'ai.testConnection',
      ].sort(),
    );
  });

  it('los avisos de la IA llegan validados, sin contenido', () => {
    const id = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    expect(eventSchema.safeParse({ type: 'ai.result', requestId: id }).success).toBe(true);
    expect(eventSchema.safeParse({ type: 'ai.pending', requestId: id }).success).toBe(true);
    expect(
      eventSchema.safeParse({ type: 'ai.result', requestId: id, text: 'una respuesta' }).success,
    ).toBe(false);
    expect(eventSchema.safeParse({ type: 'material.done', materialId: id }).success).toBe(true);
  });

  it('los tres interruptores de la IA simulada existen solo en la demostración', () => {
    expect(Object.keys(demoChannels())).toEqual(expect.arrayContaining(['demo.ai', 'demo.setAi']));
    expect(Object.keys(channels)).not.toContain('demo.ai');
  });
});
