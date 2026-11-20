import { join } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FirstTimeScreen } from '../../src/renderer/firstTime/FirstTimeScreen';
import { SettingsScreen } from '../../src/renderer/settings/SettingsScreen';
import { outsideFolder, removeOutsideFolders, sample } from '../apoyo/importar';
import { openBridge, type TestBridge } from '../apoyo/puente';

// Ajustes › «Datos y copias» (Fase 15) contra el puente real y una carpeta de datos real: la vista
// previa con sus textos, «Importar» a la materia elegida, la lista de rechazadas con «Guardar lista»
// y «Exportar todo». Los diálogos de Windows son el doble del puente.

const SLOW = { timeout: 20_000 };

const bridges: TestBridge[] = [];
function open(withCast = true) {
  const bridge = openBridge({ withCast });
  bridges.push(bridge);
  window.retenia = bridge.api as unknown as typeof window.retenia;
  return { bridge, user: userEvent.setup() };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const bridge of bridges.splice(0)) {
    bridge.close();
  }
  removeOutsideFolders();
});

describe('Importar de Anki', () => {
  it('[CA-122] la vista previa dice «Entran 3 tarjetas y 5 repasos · Rechazadas: 0» y todavía no hay tarjetas nuevas', async () => {
    const { bridge, user } = open();
    const before = bridge.workspace.cards.count();
    bridge.answerDialogs({ file: sample('mazo-demo.apkg') });
    render(<SettingsScreen demo={null} />);
    await user.click(await screen.findByRole('button', { name: 'Importar de Anki' }));
    const preview = await screen.findByRole(
      'region',
      { name: 'Vista previa de la importación' },
      SLOW,
    );
    expect(within(preview).getByText('Entran 3 tarjetas y 5 repasos · Rechazadas: 0')).toBeTruthy();
    expect(within(preview).getByText('Todavía no se escribió nada en Retenia.')).toBeTruthy();
    expect(bridge.workspace.cards.count()).toBe(before);
  }, 30_000);

  it('[CA-126] elegir «Historia argentina» e «Importar» deja las 3 tarjetas ahí y una copia «Antes de importar»', async () => {
    const { bridge, user } = open();
    bridge.answerDialogs({ file: sample('mazo-demo.apkg') });
    render(<SettingsScreen demo={null} />);
    await user.click(await screen.findByRole('button', { name: 'Importar de Anki' }));
    await user.selectOptions(
      await screen.findByLabelText('Materia de destino', {}, SLOW),
      'Historia argentina',
    );
    await user.click(screen.getByRole('button', { name: 'Importar' }));
    expect(
      await screen.findByText(
        'Listo: entraron 3 tarjetas y 5 repasos en «Historia argentina». Antes de escribir hice la copia «Antes de importar».',
        {},
        SLOW,
      ),
    ).toBeTruthy();
    const copies = await screen.findByRole('list', { name: 'Tus copias' }, SLOW);
    expect(within(copies).getAllByText(/Antes de importar/)).toHaveLength(1);
  }, 30_000);

  it('[CA-124] la segunda vez dice «0 nuevas · 3 ya estaban» y no deja importar nada', async () => {
    const { bridge, user } = open();
    bridge.answerDialogs({ file: sample('mazo-demo.apkg') });
    render(<SettingsScreen demo={null} />);
    await user.click(await screen.findByRole('button', { name: 'Importar de Anki' }));
    await user.click(await screen.findByRole('button', { name: 'Importar' }, SLOW));
    await screen.findByText(/^Listo: entraron 3 tarjetas/, {}, SLOW);
    await user.click(screen.getByRole('button', { name: 'Importar de Anki' }));
    const preview = await screen.findByRole(
      'region',
      { name: 'Vista previa de la importación' },
      SLOW,
    );
    expect(within(preview).getByText('0 nuevas · 3 ya estaban')).toBeTruthy();
    expect(within(preview).getByText('No hay nada nuevo para importar.')).toBeTruthy();
    expect(within(preview).getByRole('button', { name: 'Importar' }).hasAttribute('disabled')).toBe(
      true,
    );
  }, 30_000);
});

describe('Importar de RemNote', () => {
  it('[CA-125] después de importar, la lista de rechazadas muestra la imagen faltante con su motivo y «Guardar lista»', async () => {
    const { bridge, user } = open();
    bridge.answerDialogs({ file: sample('remnote-demo.zip') });
    render(<SettingsScreen demo={null} />);
    await user.click(await screen.findByRole('button', { name: 'Importar de RemNote' }));
    const preview = await screen.findByRole(
      'region',
      { name: 'Vista previa de la importación' },
      SLOW,
    );
    expect(
      within(preview).getByText('12 notas, 8 tarjetas, 1 rechazada (imagen faltante)'),
    ).toBeTruthy();
    expect(within(preview).getByText('Sin historial: entran como «Disponibles».')).toBeTruthy();
    await user.click(within(preview).getByRole('button', { name: 'Importar' }));
    await screen.findByText(/^Listo: entraron 12 notas y 8 tarjetas/, {}, SLOW);
    const rejected = await screen.findByRole('list', { name: 'Lo que no entró' }, SLOW);
    expect(
      within(rejected).getByText('Cruce de los Andes: mapa-del-cruce.png · imagen faltante'),
    ).toBeTruthy();
    const target = join(outsideFolder(), 'lista.txt');
    bridge.answerDialogs({ save: target });
    await user.click(screen.getByRole('button', { name: 'Guardar lista' }));
    expect(await screen.findByText('Lista guardada.', {}, SLOW)).toBeTruthy();
  }, 30_000);
});

describe('Exportar todo e Importar exportación', () => {
  it('[CA-127] «Exportar todo» guarda el archivo y muestra los conteos', async () => {
    const { bridge, user } = open();
    bridge.answerDialogs({ save: join(outsideFolder(), 'Retenia 15-03-2027.zip') });
    render(<SettingsScreen demo={null} />);
    await user.click(await screen.findByRole('button', { name: 'Exportar todo' }));
    expect(
      await screen.findByText(
        /^Exportado en «Retenia 15-03-2027\.zip»: \d+ materias · \d+ tarjetas · [\d.]+ repasos\.$/,
        {},
        SLOW,
      ),
    ).toBeTruthy();
  }, 30_000);

  it('[CA-128] con datos, «Importar exportación» explica que hace falta un Retenia vacío', async () => {
    const { user } = open();
    render(<SettingsScreen demo={null} />);
    await user.click(await screen.findByRole('button', { name: 'Importar exportación' }));
    expect(
      await screen.findByText(
        'Para cargar una exportación entera, Retenia tiene que estar vacío. Tus datos siguen como estaban.',
        {},
        SLOW,
      ),
    ).toBeTruthy();
  }, 30_000);

  it('[CA-128] la primera vez ofrece «Importar exportación» y la carga con los mismos conteos', async () => {
    const origin = openBridge({ withCast: true });
    bridges.push(origin);
    const file = join(outsideFolder(), 'Retenia.zip');
    origin.answerDialogs({ save: file });
    const exported = await origin.api['exports.all']({});
    if (exported.outcome !== 'exported') {
      throw new Error('no exportó');
    }
    vi.stubGlobal('__VARIANTE__', 'real');
    const { bridge, user } = open(false);
    bridge.answerDialogs({ file });
    let changed = 0;
    render(<FirstTimeScreen onCreated={() => undefined} onDataChanged={() => (changed += 1)} />);
    await user.click(await screen.findByRole('button', { name: 'Importar exportación' }));
    await user.click(await screen.findByRole('button', { name: 'Cargar' }, SLOW));
    const counts = `${exported.counts.subjects} materias · ${exported.counts.cards} tarjetas · ${new Intl.NumberFormat('es-AR').format(exported.counts.reviews)} repasos`;
    expect(await screen.findByText(`Listo: ${counts}.`, {}, SLOW)).toBeTruthy();
    expect(changed).toBe(1);
  }, 60_000);
});
