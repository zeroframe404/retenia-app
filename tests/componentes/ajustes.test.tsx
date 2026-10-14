import { join } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { handleMessage } from '../../src/main/bridge';
import { createDemoHandlers } from '../../src/main/demo';
import { createDemoDate } from '../../src/main/demo/clock';
import { buildApi } from '../../src/preload/api';
import { demoChannels } from '../../src/preload/contract/demo';
import { DemoRibbon } from '../../src/renderer/demo/DemoRibbon';
import { DemoSection } from '../../src/renderer/demo/DemoSection';
import { SettingsScreen } from '../../src/renderer/settings/SettingsScreen';
import { runRaw } from '../apoyo/base-cruda';
import { openBridge, type TestBridge } from '../apoyo/puente';

// Ajustes › «Datos y copias» y, en la variante de prueba, «Demostración», contra el puente real
// y una carpeta de datos real.

// Copiar y restaurar arman, comprimen y verifican archivos: con la máquina cargada (la red corre
// varias copias del proyecto a la vez) pueden tardar más que el segundo que espera por defecto.
const SLOW = { timeout: 15_000 };

const bridges: TestBridge[] = [];
function open() {
  const bridge = openBridge();
  bridges.push(bridge);
  window.retenia = bridge.api as unknown as typeof window.retenia;
  return { bridge, user: userEvent.setup() };
}
afterEach(() => {
  cleanup();
  for (const bridge of bridges.splice(0)) {
    bridge.close();
  }
});

describe('Ajustes › «Datos y copias»', () => {
  it('muestra «Ajustes», «Datos y copias» y, sin la sección de demostración, nada más', async () => {
    open();
    render(<SettingsScreen demo={null} />);
    expect(await screen.findByRole('heading', { name: 'Ajustes' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Datos y copias' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Demostración' })).toBeNull();
  });

  it('[CA-016] «Verificar datos» muestra «Todo en orden · 0 diferencias»', async () => {
    const { bridge, user } = open();
    const card = bridge.workspace.cards.create({ question: 'P', answer: 'R' });
    bridge.workspace.cards.review({
      cardId: card.id,
      grade: 'good',
      attemptId: crypto.randomUUID(),
    });
    render(<SettingsScreen demo={null} />);
    await user.click(await screen.findByRole('button', { name: 'Verificar datos' }));
    expect(await screen.findByText('Todo en orden · 0 diferencias', {}, SLOW)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reparar desde el historial' })).toBeNull();
  });

  it('[CA-016] con una agenda tocada muestra la diferencia en castellano y «Reparar desde el historial» la arregla', async () => {
    const { bridge, user } = open();
    const card = bridge.workspace.cards.create({ question: '¿Qué es la varianza?', answer: 'R' });
    bridge.workspace.cards.review({
      cardId: card.id,
      grade: 'good',
      attemptId: crypto.randomUUID(),
    });
    runRaw(
      join(bridge.dataDir, 'retenia.db'),
      "UPDATE card_schedule SET due_at = '2027-04-30T13:00:00.000Z' WHERE card_id = ?",
      card.id,
    );
    render(<SettingsScreen demo={null} />);
    await user.click(await screen.findByRole('button', { name: 'Verificar datos' }));
    expect(await screen.findByText('Hay 1 diferencia', {}, SLOW)).toBeTruthy();
    const differences = screen.getByRole('list', { name: 'Diferencias' });
    expect(
      within(differences)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual([
      '«¿Qué es la varianza?»: el próximo repaso guardado es el 30/04/2027; según el historial es el 17/03/2027',
    ]);
    await user.click(screen.getByRole('button', { name: 'Reparar desde el historial' }));
    expect(await screen.findByText('Todo en orden · 0 diferencias', {}, SLOW)).toBeTruthy();
    expect(bridge.workspace.verifyData()).toEqual([]);
  });

  it('[CA-019] «Hacer copia ahora» suma la copia con la fecha, la hora, quién la hizo, el tamaño y «Verificada»', async () => {
    const { user } = open();
    render(<SettingsScreen demo={null} />);
    expect(await screen.findByText('Todavía no hay copias.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Hacer copia ahora' }));
    expect(await screen.findByText('Copia hecha y verificada.', {}, SLOW)).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Tus copias' });
    const [row] = within(list).getAllByRole('listitem');
    expect(row?.textContent).toMatch(/^15\/03\/2027 10:00 · Hecha por vos · \d+ KB/);
    expect(within(row as HTMLElement).getByText('Verificada')).toBeTruthy();
    expect(within(row as HTMLElement).getByRole('button', { name: 'Restaurar' })).toBeTruthy();
  });

  it('[CA-020] «Restaurar» vuelve a la copia, lo dice y suma la copia «Antes de restaurar»', async () => {
    const { bridge, user } = open();
    bridge.workspace.cards.create({ question: 'En la copia', answer: 'R' });
    await bridge.workspace.createBackup('manual');
    bridge.workspace.cards.create({ question: 'Después de la copia', answer: 'R' });
    render(<SettingsScreen demo={null} />);
    const list = await screen.findByRole('list', { name: 'Tus copias' });
    await user.click(within(list).getByRole('button', { name: 'Restaurar' }));
    expect(
      await screen.findByText(
        'Listo: volviste a la copia del 15/03/2027 10:00. Lo que había antes quedó en la copia «Antes de restaurar».',
        {},
        SLOW,
      ),
    ).toBeTruthy();
    const rows = within(screen.getByRole('list', { name: 'Tus copias' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Antes de restaurar'),
      expect.stringContaining('Hecha por vos'),
    ]);
    expect(bridge.workspace.cards.list().map((card) => card.question)).toEqual(['En la copia']);
  });

  it('«Abrir carpeta de copias» abre la carpeta de copias con el Explorador (simulado)', async () => {
    const { bridge, user } = open();
    render(<SettingsScreen demo={null} />);
    await user.click(await screen.findByRole('button', { name: 'Abrir carpeta de copias' }));
    await screen.findByRole('button', { name: 'Abrir carpeta de copias' });
    expect(bridge.opened).toEqual([join(bridge.dataDir, 'copias')]);
  });

  it('si la copia falla, lo dice sin jerga: tus datos siguen como estaban', async () => {
    const { bridge, user } = open();
    bridge.handlers['backups.createNow'] = async () => {
      throw new Error('disco lleno');
    };
    render(<SettingsScreen demo={null} />);
    await user.click(await screen.findByRole('button', { name: 'Hacer copia ahora' }));
    expect(
      await screen.findByText('No pude hacer la copia. Tus datos siguen como estaban.', {}, SLOW),
    ).toBeTruthy();
    expect(screen.queryByText(/disco lleno/)).toBeNull();
  });

  it('si restaurar falla, lo dice sin jerga: tus datos siguen como estaban', async () => {
    const { bridge, user } = open();
    await bridge.workspace.createBackup('manual');
    bridge.handlers['backups.restore'] = async () => {
      throw new Error('archivo tomado');
    };
    render(<SettingsScreen demo={null} />);
    const list = await screen.findByRole('list', { name: 'Tus copias' });
    await user.click(within(list).getByRole('button', { name: 'Restaurar' }));
    expect(
      await screen.findByText(
        'No pude restaurar esa copia. Tus datos siguen como estaban.',
        {},
        SLOW,
      ),
    ).toBeTruthy();
  });
});

describe('Ajustes › «Demostración»', () => {
  function openDemo() {
    const { bridge, user } = open();
    const demo = createDemoDate(bridge.dataDir);
    const demoHandlers = createDemoHandlers(demo);
    const registry = demoChannels();
    const demoApi = buildApi(
      (channel, request) => handleMessage(demoHandlers, channel, request, registry),
      registry,
    );
    window.retenia = { ...bridge.api, ...demoApi } as unknown as typeof window.retenia;
    return { bridge, user, demo };
  }

  it('[CA-015] «+7 días» corre la fecha y la cinta lo dice al instante; «Restablecer fecha» la vuelve', async () => {
    const { user, demo } = openDemo();
    render(
      <>
        <DemoRibbon />
        <SettingsScreen demo={<DemoSection />} />
      </>,
    );
    expect(await screen.findByText('DEMOSTRACIÓN · hoy es lunes 15/03/2027')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Demostración' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '+7 días' }));
    expect(await screen.findByText('DEMOSTRACIÓN · hoy es lunes 22/03/2027')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '+1 día' }));
    expect(await screen.findByText('DEMOSTRACIÓN · hoy es martes 23/03/2027')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '+35 días' }));
    expect(await screen.findByText('DEMOSTRACIÓN · hoy es martes 27/04/2027')).toBeTruthy();
    expect(demo.today()).toBe('2027-04-27');
    await user.click(screen.getByRole('button', { name: 'Restablecer fecha' }));
    expect(await screen.findByText('DEMOSTRACIÓN · hoy es lunes 15/03/2027')).toBeTruthy();
  });
});
