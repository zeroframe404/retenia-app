import { afterEach, describe, expect, it } from 'vitest';
import { demoClock } from '../../src/core/clock';
import { openWorkspace, type Workspace } from '../../src/data/workspace';
import { createHandlers, handleMessage } from '../../src/main/bridge';
import { createDemoHandlers } from '../../src/main/demo';
import { createDemoDate } from '../../src/main/demo/clock';
import { createDemoWorkspace } from '../../src/main/demo/switcher';
import { channels } from '../../src/preload/contract';
import { demoChannels } from '../../src/preload/contract/demo';
import { tempDataFolder } from '../apoyo/base';

// Los canales «demo.dataMode», «demo.useFirstTime» y «demo.useCast» (Ajustes › «Demostración»):
// abren la demostración con una base vacía, como la primera vez, y vuelven al elenco.

const registry = { ...channels, ...demoChannels() };

const folders: ReturnType<typeof tempDataFolder>[] = [];
const demos: ReturnType<typeof createDemoWorkspace>[] = [];
const open: Workspace[] = [];
afterEach(() => {
  for (const demo of demos.splice(0)) {
    demo.close();
  }
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

// Los manejadores como los arma el principal: el espacio de trabajo es el que delega.
function handlersWithSwitcher() {
  const dataDir = folder();
  const date = createDemoDate(dataDir);
  const demo = createDemoWorkspace({
    dataDir,
    clock: date.clock,
    appVersion: '0.0.0-prueba',
  });
  demos.push(demo);
  return {
    demo,
    handlers: {
      ...createHandlers({
        clock: date.clock,
        variant: 'prueba',
        workspace: demo.workspace,
        version: '0.0.0-prueba',
        openFolder: async () => '',
      }),
      ...createDemoHandlers(date, demo),
    },
  };
}

describe('contrato: canales de los datos de la demostración', () => {
  it('el contrato de la demostración trae los seis canales y el base ninguno', () => {
    expect(Object.keys(demoChannels())).toEqual([
      'demo.state',
      'demo.advanceDays',
      'demo.resetDate',
      'demo.dataMode',
      'demo.useFirstTime',
      'demo.useCast',
    ]);
    expect(Object.keys(channels).filter((name) => name.startsWith('demo.'))).toEqual([]);
  });

  it('«demo.dataMode» dice con qué datos está abierta la demostración', async () => {
    const { handlers } = handlersWithSwitcher();
    await expect(handleMessage(handlers, 'demo.dataMode', {}, registry)).resolves.toEqual({
      mode: 'cast',
    });
  });

  it('[CA-041] «Empezar como la primera vez» deja la base vacía y «Volver al elenco» trae las materias', async () => {
    const { handlers } = handlersWithSwitcher();
    const subjects = async () =>
      (await handleMessage(handlers, 'subjects.list', {}, registry)) as {
        subjects: { name: string }[];
      };
    expect((await subjects()).subjects).toHaveLength(4);

    await expect(handleMessage(handlers, 'demo.useFirstTime', {}, registry)).resolves.toEqual({
      mode: 'first-time',
    });
    expect((await subjects()).subjects).toEqual([]);
    await expect(handleMessage(handlers, 'demo.dataMode', {}, registry)).resolves.toEqual({
      mode: 'first-time',
    });

    await expect(handleMessage(handlers, 'demo.useCast', {}, registry)).resolves.toEqual({
      mode: 'cast',
    });
    expect((await subjects()).subjects).toHaveLength(4);
  });

  it('los pedidos de datos van a la base del modo vigente: una tarjeta creada en la primera vez no está en el elenco', async () => {
    const { handlers } = handlersWithSwitcher();
    await handleMessage(handlers, 'demo.useFirstTime', {}, registry);
    await handleMessage(handlers, 'cards.create', { question: 'P', answer: 'R' }, registry);
    await handleMessage(handlers, 'demo.useCast', {}, registry);
    const { cards } = (await handleMessage(handlers, 'cards.list', {}, registry)) as {
      cards: { question: string }[];
    };
    expect(cards.map((card) => card.question)).not.toContain('P');
    expect(cards).toHaveLength(3);
  });

  it('los canales de cambio de modo no aceptan datos de más', async () => {
    const { handlers } = handlersWithSwitcher();
    for (const channel of ['demo.dataMode', 'demo.useFirstTime', 'demo.useCast']) {
      await expect(handleMessage(handlers, channel, { mode: 'cast' }, registry)).rejects.toThrow(
        `Petición rechazada en el canal «${channel}»`,
      );
    }
  });

  it('sin los datos de la demostración, «demo.dataMode» responde «cast» y los cambios fallan con un mensaje claro', async () => {
    const dataDir = folder();
    const date = createDemoDate(dataDir);
    const workspace = openWorkspace({ dataDir, clock: date.clock, appVersion: '0.0.0-prueba' });
    open.push(workspace);
    const handlers = createDemoHandlers(date);
    await expect(handleMessage(handlers, 'demo.dataMode', {}, registry)).resolves.toEqual({
      mode: 'cast',
    });
    for (const channel of ['demo.useFirstTime', 'demo.useCast']) {
      await expect(handleMessage(handlers, channel, {}, registry)).rejects.toThrow(
        /no se puede cambiar/i,
      );
    }
    // Lo de la fecha sigue andando sin tocarlo.
    await expect(handleMessage(handlers, 'demo.state', {}, registry)).resolves.toEqual({
      today: '2027-03-15',
    });
  });

  it('el reloj de la demostración es el mismo en los dos modos', async () => {
    const dataDir = folder();
    const date = createDemoDate(dataDir);
    const demo = createDemoWorkspace({ dataDir, clock: date.clock, appVersion: '0.0.0-prueba' });
    demos.push(demo);
    date.advance(7);
    await demo.useFirstTime();
    const note = demo.workspace.inbox.capture({ text: 'Hoy' });
    expect(note.count).toBe(1);
    expect(demo.workspace.inbox.list().items[0]?.day).toBe('2027-03-22');
    expect(demoClock(7).now().toISOString()).toBe(date.clock.now().toISOString());
  });
});
