import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { handleMessage } from '../../src/main/bridge';
import { createGate, gateHandlers } from '../../src/main/gate';
import { openBridge } from '../apoyo/puente';

// Mientras se restaura una copia, nada más toca los datos: la base se cierra, se reemplaza y se
// vuelve a abrir. Los demás pedidos esperan en fila y siguen cuando termina.

function deferred() {
  let release: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { done, release };
}

describe('compuerta de los pedidos', () => {
  it('mientras se restaura una copia, los demás pedidos esperan a que termine', async () => {
    const gate = createGate();
    const restoring = deferred();
    const events: string[] = [];
    const restore = gate.exclusive(async () => {
      events.push('restaurar: empieza');
      await restoring.done;
      events.push('restaurar: termina');
    });
    const list = gate.shared(async () => {
      events.push('listar');
    });
    await Promise.resolve();
    expect(events).toEqual(['restaurar: empieza']);
    restoring.release();
    await Promise.all([restore, list]);
    expect(events).toEqual(['restaurar: empieza', 'restaurar: termina', 'listar']);
  });

  it('una restauración espera a que terminen los pedidos en curso, y los que llegan después esperan a la restauración', async () => {
    const gate = createGate();
    const reviewing = deferred();
    const events: string[] = [];
    const review = gate.shared(async () => {
      events.push('repasar: empieza');
      await reviewing.done;
      events.push('repasar: termina');
    });
    const restore = gate.exclusive(async () => {
      events.push('restaurar');
    });
    const later = gate.shared(async () => {
      events.push('listar');
    });
    await Promise.resolve();
    expect(events).toEqual(['repasar: empieza']);
    reviewing.release();
    await Promise.all([review, restore, later]);
    expect(events).toEqual(['repasar: empieza', 'repasar: termina', 'restaurar', 'listar']);
  });

  it('los pedidos comunes no se esperan entre sí', async () => {
    const gate = createGate();
    const slow = deferred();
    const events: string[] = [];
    const first = gate.shared(async () => {
      await slow.done;
      events.push('lento');
    });
    const second = gate.shared(async () => {
      events.push('rápido');
    });
    await second;
    expect(events).toEqual(['rápido']);
    slow.release();
    await first;
  });

  it('con los manejadores de Retenia, un repaso pedido mientras se restaura una copia espera y queda guardado en la base restaurada', async () => {
    const bridge = openBridge();
    try {
      const card = await bridge.api['cards.create']({ question: 'P', answer: 'R' });
      const { created } = await bridge.api['backups.createNow']({});
      if (!created.readable) {
        throw new Error('la copia tendría que poder abrirse');
      }
      const routes = gateHandlers(bridge.handlers, createGate());
      const order: string[] = [];
      const restoring = handleMessage(routes, 'backups.restore', { backupId: created.id }).then(
        () => order.push('restaurar'),
      );
      const reviewing = handleMessage(routes, 'cards.review', {
        cardId: card.id,
        grade: 'good',
        attemptId: randomUUID(),
      }).then(() => order.push('repasar'));
      await Promise.all([restoring, reviewing]);

      expect(order).toEqual(['restaurar', 'repasar']);
      const history = await bridge.api['cards.history']({ cardId: card.id });
      expect(history.entries.map((entry) => entry.result)).toEqual(['good']);
    } finally {
      bridge.close();
    }
  });

  it('si la restauración falla, la falla llega a quien la pidió y los demás siguen', async () => {
    const gate = createGate();
    const failed = gate.exclusive(async () => {
      throw new Error('no se pudo');
    });
    const after = gate.shared(async () => 'sigue');
    await expect(failed).rejects.toThrow('no se pudo');
    await expect(after).resolves.toBe('sigue');
  });
});
