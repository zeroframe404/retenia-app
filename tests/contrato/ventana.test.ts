import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import type { ZoomDirection } from '../../src/core/zoom';
import { openWorkspace, type Workspace } from '../../src/data/workspace';
import { createHandlers, handleMessage } from '../../src/main/bridge';
import { tempDataFolder } from '../apoyo/base';
import { openBridge, type TestBridge } from '../apoyo/puente';

// El zoom de la ventana con el teclado (canal «window.zoom»): la ventana atrapa Ctrl y +, Ctrl y -
// y Ctrl y 0, y el principal cambia el zoom (CA-035).

const bridges: TestBridge[] = [];
const folders: ReturnType<typeof tempDataFolder>[] = [];
const open: Workspace[] = [];
afterEach(() => {
  for (const bridge of bridges.splice(0)) {
    bridge.close();
  }
  for (const workspace of open.splice(0)) {
    workspace.close();
  }
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

function handlersWithZoom(zoom: (direction: ZoomDirection) => number) {
  const folder = tempDataFolder();
  folders.push(folder);
  const clock = demoClock();
  const workspace = openWorkspace({ dataDir: folder.folder, clock, appVersion: '0.0.0-prueba' });
  open.push(workspace);
  return createHandlers({
    clock,
    variant: 'prueba',
    workspace,
    version: '0.0.0-prueba',
    openFolder: async () => '',
    zoom,
  });
}

describe('zoom de la ventana: canal «window.zoom»', () => {
  it('[CA-035] le pasa al principal la dirección pedida y devuelve el factor que quedó', async () => {
    const asked: ZoomDirection[] = [];
    let factor = 1;
    const handlers = handlersWithZoom((direction) => {
      asked.push(direction);
      factor = direction === 'reset' ? 1 : factor + (direction === 'in' ? 0.25 : -0.25);
      return factor;
    });
    expect(await handleMessage(handlers, 'window.zoom', { direction: 'in' })).toEqual({
      factor: 1.25,
    });
    expect(await handleMessage(handlers, 'window.zoom', { direction: 'in' })).toEqual({
      factor: 1.5,
    });
    expect(await handleMessage(handlers, 'window.zoom', { direction: 'out' })).toEqual({
      factor: 1.25,
    });
    expect(await handleMessage(handlers, 'window.zoom', { direction: 'reset' })).toEqual({
      factor: 1,
    });
    expect(asked).toEqual(['in', 'in', 'out', 'reset']);
  });

  it('sin ventana (las pruebas del principal sin Electron) no cambia nada y responde 100 %', async () => {
    const bridge = openBridge();
    bridges.push(bridge);
    expect(await bridge.api['window.zoom']({ direction: 'in' })).toEqual({ factor: 1 });
  });

  it('rechaza una dirección que no existe y todo dato de más, antes de tocar el zoom', async () => {
    const asked: ZoomDirection[] = [];
    const handlers = handlersWithZoom((direction) => {
      asked.push(direction);
      return 1;
    });
    await expect(handleMessage(handlers, 'window.zoom', { direction: 'sideways' })).rejects.toThrow(
      'Petición rechazada en el canal «window.zoom»',
    );
    await expect(
      handleMessage(handlers, 'window.zoom', { direction: 'in', factor: 3 }),
    ).rejects.toThrow('Petición rechazada');
    await expect(handleMessage(handlers, 'window.zoom', {})).rejects.toThrow('Petición rechazada');
    expect(asked).toEqual([]);
  });

  it('rechaza una respuesta con un factor que no es positivo', async () => {
    const handlers = handlersWithZoom(() => 0);
    await expect(handleMessage(handlers, 'window.zoom', { direction: 'in' })).rejects.toThrow(
      'Respuesta rechazada en el canal «window.zoom»',
    );
  });
});
