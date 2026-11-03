import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openWorkspace, type Workspace } from '../../src/data/workspace';
import { createHandlers, handleMessage } from '../../src/main/bridge';
import { createDemoHandlers } from '../../src/main/demo';
import { createDemoDate } from '../../src/main/demo/clock';
import { channels } from '../../src/preload/contract';
import { demoChannels } from '../../src/preload/contract/demo';
import { tempDataFolder } from '../apoyo/base';

// Ajustes › «Demostración»: «+1 día», «+7 días», «+35 días» y «Restablecer fecha» mueven el reloj
// de la variante de prueba. Los días sumados quedan en ajustes.json de la carpeta de datos, así
// la fecha sobrevive al cierre (y «npm run datos:reiniciar», que vacía la carpeta, la vuelve).

const folders: ReturnType<typeof tempDataFolder>[] = [];
const open: Workspace[] = [];
afterEach(() => {
  for (const workspace of open.splice(0)) {
    workspace.close();
  }
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

function folder() {
  const created = tempDataFolder();
  folders.push(created);
  return created.folder;
}

const registry = { ...channels, ...demoChannels() };

describe('reloj de demostración', () => {
  it('arranca el lunes 15/03/2027 y «+1 día», «+7 días» y «+35 días» lo corren', () => {
    const demo = createDemoDate(folder());
    expect(demo.today()).toBe('2027-03-15');
    expect(demo.advance(7)).toBe('2027-03-22');
    expect(demo.advance(1)).toBe('2027-03-23');
    expect(demo.advance(35)).toBe('2027-04-27');
    expect(demo.clock.now().toISOString()).toBe('2027-04-27T13:00:00.000Z');
    expect(demo.reset()).toBe('2027-03-15');
  });

  it('los días sumados sobreviven al cierre: quedan en ajustes.json', () => {
    const dir = folder();
    createDemoDate(dir).advance(7);
    expect(JSON.parse(readFileSync(join(dir, 'ajustes.json'), 'utf8'))).toEqual({
      demoDayOffset: 7,
    });
    expect(createDemoDate(dir).today()).toBe('2027-03-22');
  });

  it('respeta lo demás que haya en ajustes.json y, si está dañado, vuelve al 15/03/2027 sin fallar', () => {
    const dir = folder();
    writeFileSync(join(dir, 'ajustes.json'), JSON.stringify({ otro: 'valor', demoDayOffset: 1 }));
    expect(createDemoDate(dir).advance(1)).toBe('2027-03-17');
    expect(JSON.parse(readFileSync(join(dir, 'ajustes.json'), 'utf8'))).toEqual({
      otro: 'valor',
      demoDayOffset: 2,
    });
    writeFileSync(join(dir, 'ajustes.json'), '{ esto no es JSON');
    expect(createDemoDate(dir).today()).toBe('2027-03-15');
  });

  it('el reloj es vivo: lo que pasa después de «+7 días» queda con la fecha nueva', () => {
    const dir = folder();
    const demo = createDemoDate(dir);
    const workspace = openWorkspace({
      dataDir: dir,
      clock: demo.clock,
      appVersion: '0.0.0-prueba',
    });
    open.push(workspace);
    const card = workspace.cards.create({ question: 'P', answer: 'R' });
    workspace.cards.review({ cardId: card.id, grade: 'good', attemptId: randomUUID() });
    demo.advance(7);
    workspace.cards.review({ cardId: card.id, grade: 'hard', attemptId: randomUUID() });
    expect(workspace.cards.history({ cardId: card.id }).entries.map((entry) => entry.day)).toEqual([
      '2027-03-15',
      '2027-03-22',
    ]);
  });
});

describe('contrato: canales de demostración', () => {
  function handlersFor(dir: string) {
    const demo = createDemoDate(dir);
    const workspace = openWorkspace({
      dataDir: dir,
      clock: demo.clock,
      appVersion: '0.0.0-prueba',
    });
    open.push(workspace);
    return {
      ...createHandlers({
        clock: demo.clock,
        variant: 'prueba',
        workspace,
        version: '0.0.0-prueba',
        openFolder: async () => '',
      }),
      ...createDemoHandlers(demo),
    };
  }

  it('«demo.advanceDays» con 1, 7 o 35 corre la fecha y «demo.resetDate» la vuelve; «demo.state» dice la vigente', async () => {
    const handlers = handlersFor(folder());
    await expect(
      handleMessage(handlers, 'demo.advanceDays', { days: 7 }, registry),
    ).resolves.toEqual({
      today: '2027-03-22',
    });
    await expect(handleMessage(handlers, 'demo.state', {}, registry)).resolves.toEqual({
      today: '2027-03-22',
    });
    await expect(
      handleMessage(handlers, 'demo.advanceDays', { days: 35 }, registry),
    ).resolves.toEqual({
      today: '2027-04-26',
    });
    await expect(handleMessage(handlers, 'demo.resetDate', {}, registry)).resolves.toEqual({
      today: '2027-03-15',
    });
  });

  it('solo acepta 1, 7 o 35 días', async () => {
    const handlers = handlersFor(folder());
    for (const request of [
      { days: 2 },
      { days: 0 },
      { days: -7 },
      { days: '7' },
      {},
      { days: 7, extra: 1 },
    ]) {
      await expect(handleMessage(handlers, 'demo.advanceDays', request, registry)).rejects.toThrow(
        'Petición rechazada en el canal «demo.advanceDays»',
      );
    }
    await expect(handleMessage(handlers, 'demo.resetDate', { days: 0 }, registry)).rejects.toThrow(
      'Petición rechazada',
    );
  });

  it('el contrato base no trae «demo.advanceDays» ni «demo.resetDate»', () => {
    expect(Object.keys(channels).filter((name) => name.startsWith('demo.'))).toEqual([]);
    expect(Object.keys(demoChannels())).toEqual([
      'demo.state',
      'demo.advanceDays',
      'demo.resetDate',
      'demo.dataMode',
      'demo.useFirstTime',
      'demo.useCast',
    ]);
  });
});
