import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleMessage } from '../../src/main/bridge';
import { createDemoHandlers } from '../../src/main/demo';
import { createDemoDate } from '../../src/main/demo/clock';
import { buildApi } from '../../src/preload/api';
import { demoChannels } from '../../src/preload/contract/demo';
import { App } from '../../src/renderer/App';
import { openBridge, type TestBridge } from '../apoyo/puente';

// La ventana entera (riel, pantallas, atajos y cuadro de búsqueda) contra el puente real y una
// carpeta de datos real. La punta a punta repite lo importante con el programa empaquetado.

const bridges: TestBridge[] = [];

function openApp(variant: 'prueba' | 'real') {
  vi.stubGlobal('__VARIANTE__', variant);
  const bridge = openBridge();
  bridges.push(bridge);
  // Desde la Fase 07 una base sin materias es la primera vez (una sola pregunta, sin riel): el
  // armazón se prueba con una materia activa.
  bridge.workspace.subjects.create({ name: 'Estadística básica', makeActive: true });
  let api: unknown = bridge.api;
  if (variant === 'prueba') {
    const demo = createDemoDate(bridge.dataDir);
    const demoHandlers = createDemoHandlers(demo);
    const registry = demoChannels();
    const demoApi = buildApi(
      (channel, request) => handleMessage(demoHandlers, channel, request, registry),
      registry,
    );
    api = {
      ...bridge.api,
      ...demoApi,
      'demo.connection': async () => ({ offline: false }),
      'demo.setConnection': async ({ offline }: { offline: boolean }) => ({ offline }),
    };
  }
  window.retenia = api as typeof window.retenia;
  return { bridge, user: userEvent.setup() };
}

beforeEach(() => {
  delete document.documentElement.dataset.theme;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const bridge of bridges.splice(0)) {
    bridge.close();
  }
});

const rail = () => screen.getByRole('navigation', { name: 'Riel lateral' });
const goTo = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(within(rail()).getByRole('button', { name }));
  await screen.findByRole('heading', { level: 2, name });
};
const primaries = () =>
  [...document.querySelectorAll<HTMLElement>('main [data-button="primary"]')].map(
    (button) => button.textContent,
  );

describe('el riel lateral', () => {
  it('[CA-031] tiene «Buscar» arriba y, en este orden, Estudiar, Apuntes, Materiales, Idiomas, Progreso y Ajustes', () => {
    openApp('real');
    render(<App />);
    const names = within(rail())
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(names).toEqual([
      'BuscarCtrl+K',
      'Estudiar',
      'Apuntes',
      'Materiales',
      'Idiomas',
      'Progreso',
      'Ajustes',
    ]);
    expect(screen.getByRole('heading', { level: 1, name: 'Retenia' })).toBeTruthy();
  });

  it('marca el destino actual y no usa elementos de lista (las listas son las de los datos)', async () => {
    const { user } = openApp('real');
    render(<App />);
    expect(
      within(rail()).getByRole('button', { name: 'Estudiar' }).getAttribute('aria-current'),
    ).toBe('page');
    await goTo(user, 'Materiales');
    expect(
      within(rail()).getByRole('button', { name: 'Materiales' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(
      within(rail()).getByRole('button', { name: 'Estudiar' }).getAttribute('aria-current'),
    ).toBeNull();
    expect(within(rail()).queryAllByRole('listitem')).toEqual([]);
  });

  it('[CA-031] cada destino abre su pantalla con su título y exactamente un botón primario', async () => {
    const { user } = openApp('real');
    render(<App />);
    const found: Record<string, (string | null)[]> = {};
    for (const name of ['Estudiar', 'Apuntes', 'Materiales', 'Idiomas', 'Progreso', 'Ajustes']) {
      await goTo(user, name);
      found[name] = primaries();
    }
    expect(found).toEqual({
      Estudiar: ['Ir a Apuntes'],
      Apuntes: ['Nueva nota'],
      Materiales: ['Ir a Apuntes'],
      Idiomas: ['Ir a Apuntes'],
      Progreso: ['Ir a Apuntes'],
      Ajustes: ['Hacer copia ahora'],
    });
  });

  it('lo que todavía no existe dice «Todavía no disponible» y «Ir a Apuntes» lleva a lo que sí se puede hacer', async () => {
    const { user } = openApp('real');
    render(<App />);
    for (const name of ['Estudiar', 'Materiales', 'Idiomas', 'Progreso']) {
      await goTo(user, name);
      const main = screen.getByRole('main');
      expect(within(main).getByText(/^Todavía no disponible\./)).toBeTruthy();
    }
    await user.click(screen.getByRole('button', { name: 'Ir a Apuntes' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Apuntes' })).toBeTruthy();
  });
});

describe('Apuntes: adentro está la pantalla provisoria «Tarjetas»', () => {
  it('«Tarjetas» ya no es un destino del riel: vive en Apuntes, con la Papelera y la Actividad reciente', async () => {
    const { bridge, user } = openApp('real');
    await bridge.api['cards.create']({ question: '¿Capital de Francia?', answer: 'París' });
    render(<App />);
    expect(within(rail()).queryByRole('button', { name: 'Tarjetas' })).toBeNull();
    expect(within(rail()).queryByRole('button', { name: 'Papelera' })).toBeNull();
    await goTo(user, 'Apuntes');
    const sections = screen.getByRole('navigation', { name: 'Secciones de Apuntes' });
    expect(
      within(sections)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Notas', 'Bandeja', 'Tarjetas', 'Papelera', 'Actividad reciente']);
    // Apuntes abre en «Notas»; las tarjetas siguen en su sección.
    expect(screen.queryByText('¿Capital de Francia?')).toBeNull();
    await user.click(within(sections).getByRole('button', { name: 'Tarjetas' }));
    expect(await screen.findByText('¿Capital de Francia?')).toBeTruthy();
    await user.click(within(sections).getByRole('button', { name: 'Papelera' }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Papelera' })).toBeTruthy();
    await user.click(within(sections).getByRole('button', { name: 'Actividad reciente' }));
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Actividad reciente' }),
    ).toBeTruthy();
    await goTo(user, 'Estudiar');
    expect(screen.queryByText('¿Capital de Francia?')).toBeNull();
  });
});

describe('atajos de teclado y cuadro de búsqueda', () => {
  it('[CA-034] Ctrl+1 a Ctrl+6 abren Estudiar, Apuntes, Materiales, Idiomas, Progreso y Ajustes, y el foco pasa al título', async () => {
    const { user } = openApp('real');
    render(<App />);
    const names = ['Estudiar', 'Apuntes', 'Materiales', 'Idiomas', 'Progreso', 'Ajustes'];
    for (const [index, name] of names.entries()) {
      await user.keyboard(`{Control>}${index + 1}{/Control}`);
      const heading = await screen.findByRole('heading', { level: 2, name });
      expect(document.activeElement).toBe(heading);
    }
  });

  it('[CA-034] Ctrl+K abre «Buscar» con el foco adentro, Esc lo cierra y el foco vuelve a donde estaba', async () => {
    const { user } = openApp('real');
    render(<App />);
    const before = within(rail()).getByRole('button', { name: 'Materiales' });
    before.focus();
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Buscar' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(within(dialog).getByText('La búsqueda todavía no está disponible.')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(before);
  });

  it('[CA-034] «Buscar» del riel abre lo mismo, Tab no sale del cuadro y su botón lo cierra', async () => {
    const { user } = openApp('real');
    render(<App />);
    await user.click(within(rail()).getByRole('button', { name: /^Buscar/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Buscar' });
    for (let times = 0; times < 4; times += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('con el cuadro abierto, los atajos de los destinos no cambian de pantalla', async () => {
    const { user } = openApp('real');
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    await screen.findByRole('dialog', { name: 'Buscar' });
    await user.keyboard('{Control>}3{/Control}');
    expect(screen.getByRole('heading', { level: 2, name: 'Estudiar' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: 'Materiales' })).toBeNull();
  });

  it('un atajo con otra tecla modificadora no hace nada: Ctrl+Mayús+2 y Alt+2 no abren Apuntes', async () => {
    const { user } = openApp('real');
    render(<App />);
    await user.keyboard('{Control>}{Shift>}2{/Shift}{/Control}');
    await user.keyboard('{Alt>}2{/Alt}');
    expect(screen.getByRole('heading', { level: 2, name: 'Estudiar' })).toBeTruthy();
  });
});

describe('el contorno del foco sigue a la última acción', () => {
  it('[CA-034] después de una tecla (también Ctrl y un número) el contorno se muestra en lo que tiene el foco; después de un clic, no se fuerza', async () => {
    const { user } = openApp('real');
    render(<App />);
    const root = document.documentElement;
    await user.click(within(rail()).getByRole('button', { name: 'Idiomas' }));
    expect(root.dataset.input).toBe('pointer');
    await user.keyboard('{Control>}3{/Control}');
    expect(root.dataset.input).toBe('keyboard');
    await user.click(within(rail()).getByRole('button', { name: 'Progreso' }));
    expect(root.dataset.input).toBe('pointer');
    await user.keyboard('{Tab}');
    expect(root.dataset.input).toBe('keyboard');
  });
});

describe('atajos en otras situaciones', () => {
  it('[CA-034] Ctrl y un número anda por la tecla física: en un teclado donde el número exige Mayús, también', async () => {
    openApp('real');
    render(<App />);
    fireEvent.keyDown(document.body, { key: '&', code: 'Digit3', ctrlKey: true });
    expect(await screen.findByRole('heading', { level: 2, name: 'Materiales' })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'é', code: 'Digit2', ctrlKey: true });
    expect(await screen.findByRole('heading', { level: 2, name: 'Apuntes' })).toBeTruthy();
  });

  it('con otro cuadro abierto (el de ejemplo de la «Galería»), Ctrl y K no abre «Buscar» encima', async () => {
    const { user } = openApp('prueba');
    render(<App />);
    await goTo(user, 'Ajustes');
    await user.click(await screen.findByRole('button', { name: 'Galería' }));
    await user.click(await screen.findByRole('button', { name: 'Abrir el diálogo de ejemplo' }));
    await screen.findByRole('dialog', { name: 'Diálogo de ejemplo' });
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.queryByRole('dialog', { name: 'Buscar' })).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});

describe('zoom con el teclado', () => {
  const zooms = (bridge: TestBridge) =>
    bridge.sent
      .filter((message) => message.channel === 'window.zoom')
      .map((message) => (message.request as { direction: string }).direction);

  it('[CA-035] Ctrl y + (con o sin Mayús) agranda, Ctrl y - achica y Ctrl y 0 vuelve al 100 %', async () => {
    const { bridge, user } = openApp('real');
    render(<App />);
    await user.keyboard('{Control>}={/Control}');
    await user.keyboard('{Control>}{Shift>}+{/Shift}{/Control}');
    await user.keyboard('{Control>}-{/Control}');
    await user.keyboard('{Control>}0{/Control}');
    await waitFor(() => expect(zooms(bridge)).toEqual(['in', 'in', 'out', 'reset']));
  });

  it('[CA-035] el zoom anda también con el cuadro «Buscar» abierto, y no confunde las teclas de los destinos', async () => {
    const { bridge, user } = openApp('real');
    render(<App />);
    await user.keyboard('{Control>}k{/Control}');
    await screen.findByRole('dialog', { name: 'Buscar' });
    await user.keyboard('{Control>}={/Control}');
    await waitFor(() => expect(zooms(bridge)).toEqual(['in']));
    await user.keyboard('{Escape}');
    await user.keyboard('{Control>}1{/Control}');
    await user.keyboard('{Alt>}={/Alt}');
    expect(zooms(bridge)).toEqual(['in']);
  });
});

describe('Ajustes › «Apariencia»', () => {
  it('[CA-032] «Oscuro» cambia el tema al instante y se guarda; «Claro» lo vuelve; «Según el sistema» lo suelta', async () => {
    const { bridge, user } = openApp('real');
    render(<App />);
    await goTo(user, 'Ajustes');
    const group = await screen.findByRole('group', { name: 'Tema de la interfaz' });
    expect(
      (within(group).getByRole('radio', { name: 'Según el sistema' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(document.documentElement.dataset.theme).toBeUndefined();

    await user.click(within(group).getByRole('radio', { name: 'Oscuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    await waitFor(async () =>
      expect(await bridge.api['appearance.get']({})).toEqual({ choice: 'dark' }),
    );

    await user.click(within(group).getByRole('radio', { name: 'Claro' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(within(group).getByRole('radio', { name: 'Según el sistema' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    await waitFor(async () =>
      expect(await bridge.api['appearance.get']({})).toEqual({ choice: 'system' }),
    );
  });

  it('[CA-032] al abrir, la elección guardada se aplica sin tocar nada', async () => {
    const { bridge } = openApp('real');
    await bridge.api['appearance.set']({ choice: 'dark' });
    render(<App />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });

  it('si no se puede guardar, el tema igual cambia y se avisa sin jerga', async () => {
    const { bridge, user } = openApp('real');
    const original = window.retenia['appearance.set'];
    window.retenia = {
      ...window.retenia,
      'appearance.set': async () => {
        throw new Error('disco lleno');
      },
    };
    render(<App />);
    await goTo(user, 'Ajustes');
    await user.click(await screen.findByRole('radio', { name: 'Oscuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(await screen.findByText('No pude guardar la apariencia. Probá de nuevo.')).toBeTruthy();
    expect(original).toBeTypeOf('function');
    expect(await bridge.api['appearance.get']({})).toEqual({ choice: 'system' });
  });
});

describe('«Retenia (prueba)»: cinta y «Galería»', () => {
  it('muestra la cinta de demostración y «Galería» dentro de Ajustes › «Demostración»', async () => {
    const { user } = openApp('prueba');
    render(<App />);
    expect(await screen.findByText('DEMOSTRACIÓN · hoy es lunes 15/03/2027')).toBeTruthy();
    await goTo(user, 'Ajustes');
    expect(await screen.findByRole('heading', { level: 3, name: 'Demostración' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Galería' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Galería' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Volver a Ajustes' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Ajustes' })).toBeTruthy();
  });

  it('en la versión real no hay cinta ni «Demostración»', async () => {
    const { user } = openApp('real');
    render(<App />);
    await goTo(user, 'Ajustes');
    expect(screen.queryByText(/^DEMOSTRACIÓN/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Demostración' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Galería' })).toBeNull();
  });
});
