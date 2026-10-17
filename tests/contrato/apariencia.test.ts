import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import type { ThemeChoice } from '../../src/core/theme';
import { openWorkspace, type Workspace } from '../../src/data/workspace';
import { createAppearanceStore } from '../../src/main/appearance';
import { createHandlers, handleMessage } from '../../src/main/bridge';
import { createDemoDate } from '../../src/main/demo/clock';
import { tempDataFolder } from '../apoyo/base';
import { openBridge, type TestBridge } from '../apoyo/puente';

// Ajustes › «Apariencia» (CA-032): la elección vive en `ajustes.json` de la carpeta de datos,
// así sobrevive al cierre; el principal la valida y le avisa a la ventana del marco.

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

function bridge() {
  const opened = openBridge();
  bridges.push(opened);
  return opened;
}

function handlersWithNotice(notice: (choice: ThemeChoice) => void) {
  const folder = tempDataFolder();
  folders.push(folder);
  const clock = demoClock();
  const workspace = openWorkspace({ dataDir: folder.folder, clock, appVersion: '0.0.0-prueba' });
  open.push(workspace);
  return {
    dataDir: folder.folder,
    handlers: createHandlers({
      clock,
      variant: 'prueba',
      workspace,
      version: '0.0.0-prueba',
      openFolder: async () => '',
      onAppearanceChange: notice,
    }),
  };
}

describe('apariencia: canales «appearance.get» y «appearance.set»', () => {
  it('[CA-032] sin elección guardada responde «Según el sistema»', async () => {
    const { api } = bridge();
    expect(await api['appearance.get']({})).toEqual({ choice: 'sistema' });
  });

  it('[CA-032] elegir «Oscuro» la devuelve y queda guardada en ajustes.json', async () => {
    const { api, dataDir } = bridge();
    expect(await api['appearance.set']({ choice: 'oscuro' })).toEqual({ choice: 'oscuro' });
    expect(await api['appearance.get']({})).toEqual({ choice: 'oscuro' });
    expect(JSON.parse(readFileSync(join(dataDir, 'ajustes.json'), 'utf8'))).toEqual({
      appearance: 'oscuro',
    });
  });

  it('[CA-032] al cerrar y abrir (un almacén nuevo sobre la misma carpeta) la elección sigue', () => {
    const { dataDir } = bridge();
    createAppearanceStore(dataDir).set('oscuro');
    expect(createAppearanceStore(dataDir).get()).toBe('oscuro');
    createAppearanceStore(dataDir).set('sistema');
    expect(createAppearanceStore(dataDir).get()).toBe('sistema');
    createAppearanceStore(dataDir).set('claro');
    expect(createAppearanceStore(dataDir).get()).toBe('claro');
  });

  it('respeta lo demás que haya en ajustes.json (la fecha de la demostración) y no lo pisa', () => {
    const { dataDir } = bridge();
    const demo = createDemoDate(dataDir);
    demo.advance(7);
    createAppearanceStore(dataDir).set('oscuro');
    expect(JSON.parse(readFileSync(join(dataDir, 'ajustes.json'), 'utf8'))).toEqual({
      demoDayOffset: 7,
      appearance: 'oscuro',
    });
    demo.advance(1);
    expect(JSON.parse(readFileSync(join(dataDir, 'ajustes.json'), 'utf8'))).toEqual({
      demoDayOffset: 8,
      appearance: 'oscuro',
    });
    expect(createDemoDate(dataDir).today()).toBe('2027-03-23');
  });

  it('un valor dañado o inventado en ajustes.json vuelve a «Según el sistema» sin fallar', () => {
    const { dataDir } = bridge();
    writeFileSync(join(dataDir, 'ajustes.json'), JSON.stringify({ appearance: 'violeta' }));
    expect(createAppearanceStore(dataDir).get()).toBe('sistema');
    writeFileSync(join(dataDir, 'ajustes.json'), '{ esto no es JSON');
    expect(createAppearanceStore(dataDir).get()).toBe('sistema');
    expect(createAppearanceStore(dataDir).set('claro')).toBe('claro');
    expect(createAppearanceStore(dataDir).get()).toBe('claro');
  });

  it('rechaza una elección que no existe, antes de tocar nada', async () => {
    const { api, dataDir } = bridge();
    await expect(
      api['appearance.set']({ choice: 'violeta' as unknown as 'claro' }),
    ).rejects.toThrow('Petición rechazada en el canal «appearance.set»');
    await expect(
      api['appearance.set']({ choice: 'oscuro', extra: 1 } as unknown as { choice: 'oscuro' }),
    ).rejects.toThrow('Petición rechazada');
    expect(() => readFileSync(join(dataDir, 'ajustes.json'), 'utf8')).toThrow();
  });

  it('el principal rechaza un mensaje inválido aunque llegue sin pasar por la ventana', async () => {
    const { handlers } = handlersWithNotice(() => undefined);
    await expect(handleMessage(handlers, 'appearance.set', { choice: 'violeta' })).rejects.toThrow(
      'Petición rechazada en el canal «appearance.set»',
    );
  });

  it('[CA-032] avisa al marco de la ventana cada vez que la elección cambia', async () => {
    const heard: ThemeChoice[] = [];
    const { handlers } = handlersWithNotice((choice) => heard.push(choice));
    await handleMessage(handlers, 'appearance.set', { choice: 'oscuro' });
    await handleMessage(handlers, 'appearance.set', { choice: 'claro' });
    await handleMessage(handlers, 'appearance.get', {});
    expect(heard).toEqual(['oscuro', 'claro']);
  });
});
