import { describe, expect, it } from 'vitest';
import { demoExclusiveChannels } from '../../src/main/demo';
import { createGate, gateHandlers } from '../../src/main/gate';

// Cambiar los datos de la demostración cierra una base y abre otra: es exclusivo, como restaurar
// una copia. Los pedidos en curso terminan antes y los que llegan después esperan.

function deferred() {
  let release: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { done, release };
}

describe('compuerta: cambiar los datos de la demostración', () => {
  it('los canales exclusivos de la demostración son los dos que cambian de datos', () => {
    expect([...demoExclusiveChannels]).toEqual(['demo.useFirstTime', 'demo.useCast']);
  });

  it.for(['demo.useFirstTime', 'demo.useCast'])(
    '«%s» espera a los pedidos en curso, y los que llegan después esperan a que termine',
    async (channel) => {
      const gate = createGate();
      const reading = deferred();
      const events: string[] = [];
      const plain: Record<string, (request: never) => Promise<unknown>> = {
        'cards.list': async () => {
          events.push('listar: empieza');
          await reading.done;
          events.push('listar: termina');
        },
        [channel]: async () => {
          events.push('cambiar de modo');
        },
        'subjects.list': async () => {
          events.push('materias');
        },
      };
      const handlers = gateHandlers(plain, gate, demoExclusiveChannels);

      const list = handlers['cards.list']?.({} as never);
      const change = handlers[channel]?.({} as never);
      const later = handlers['subjects.list']?.({} as never);
      await Promise.resolve();
      expect(events).toEqual(['listar: empieza']);
      reading.release();
      await Promise.all([list, change, later]);

      expect(events).toEqual(['listar: empieza', 'listar: termina', 'cambiar de modo', 'materias']);
    },
  );
});
