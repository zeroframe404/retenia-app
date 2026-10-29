import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { handleMessage } from '../../src/main/bridge';
import { createDemoHandlers } from '../../src/main/demo';
import { createDemoDate } from '../../src/main/demo/clock';
import { buildApi } from '../../src/preload/api';
import { demoChannels } from '../../src/preload/contract/demo';
import { App } from '../../src/renderer/App';
import { closeWindows, openExtraBridge, openWindow, seedSubjects } from './apoyo-ventana';

// La primera vez (H-09, CA-041): una base sin materias muestra una sola pregunta. Y, en la
// demostración, «Empezar como la primera vez» y «Volver al elenco» de Ajustes.

afterEach(closeWindows);

const QUESTION = '¿Qué querés aprender ahora?';
const field = () => screen.getByRole('textbox', { name: QUESTION });
const rail = () => screen.queryByRole('navigation', { name: 'Riel lateral' });
const main = () => within(screen.getByRole('main'));

describe('la pantalla de la primera vez', () => {
  it('[CA-041] sin materias hay una sola pregunta, sin riel: «Retenia», el campo y dos botones, el primero es el único primario', async () => {
    openWindow();
    render(<App />);
    expect(await screen.findByRole('textbox', { name: QUESTION })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Retenia' })).toBeTruthy();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(rail()).toBeNull();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Agregar mi primer material',
      'Probar con un ejemplo (3 min)',
    ]);
    const primaries = [...document.querySelectorAll('[data-button="primary"]')].map(
      (button) => button.textContent,
    );
    expect(primaries).toEqual(['Agregar mi primer material']);
  });

  it('[CA-041] escribir «Química orgánica» y apretar Enter crea la materia activa y lleva a Materiales, todavía vacío', async () => {
    const { api, user } = openWindow();
    render(<App />);
    await user.type(
      await screen.findByRole('textbox', { name: QUESTION }),
      'Química orgánica{Enter}',
    );

    expect(await screen.findByRole('heading', { level: 2, name: 'Materiales' })).toBeTruthy();
    expect(main().getByText(/^Todavía no disponible\./)).toBeTruthy();
    expect(rail()).not.toBeNull();
    expect(screen.queryByRole('textbox', { name: QUESTION })).toBeNull();
    const { subjects } = await api['subjects.list']({});
    expect(subjects.map((s) => [s.name, s.status, s.isExample])).toEqual([
      ['Química orgánica', 'active', false],
    ]);

    await user.click(within(rail() as HTMLElement).getByRole('button', { name: 'Estudiar' }));
    expect(await main().findByText('Química orgánica')).toBeTruthy();
  });

  it('[CA-041] «Agregar mi primer material» hace lo mismo que Enter', async () => {
    const { api, user } = openWindow();
    render(<App />);
    await user.type(await screen.findByRole('textbox', { name: QUESTION }), 'Estadística básica');
    await user.click(screen.getByRole('button', { name: 'Agregar mi primer material' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Materiales' })).toBeTruthy();
    expect((await api['subjects.list']({})).subjects[0]?.status).toBe('active');
  });

  it('[CA-041] con el campo vacío o con solo espacios avisa, pone el foco en el campo y no crea nada', async () => {
    const { api, user } = openWindow();
    render(<App />);
    await screen.findByRole('textbox', { name: QUESTION });
    await user.click(screen.getByRole('button', { name: 'Agregar mi primer material' }));
    expect(await screen.findByText('Escribí qué querés aprender')).toBeTruthy();
    expect(document.activeElement).toBe(field());
    await user.type(field(), '   {Enter}');
    expect(screen.getByText('Escribí qué querés aprender')).toBeTruthy();
    expect((await api['subjects.list']({})).subjects).toEqual([]);

    await user.type(field(), 'a'.repeat(121));
    await user.click(screen.getByRole('button', { name: 'Agregar mi primer material' }));
    expect(await screen.findByText('Es demasiado largo: el máximo es 120 caracteres')).toBeTruthy();
    expect((await api['subjects.list']({})).subjects).toEqual([]);
  });

  it('[CA-041] «Probar con un ejemplo (3 min)» carga «Ejemplo» con la etiqueta EJEMPLO, la deja activa y lleva a Estudiar', async () => {
    const { api, user } = openWindow();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Probar con un ejemplo (3 min)' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Estudiar' })).toBeTruthy();
    expect(await main().findByText('Ejemplo')).toBeTruthy();
    expect(main().getByText('EJEMPLO')).toBeTruthy();
    const { subjects } = await api['subjects.list']({});
    expect(subjects.map((s) => [s.name, s.status, s.isExample])).toEqual([
      ['Ejemplo', 'active', true],
    ]);
    // Trae su tema y su nota, con contenido de verdad.
    const [subject] = subjects;
    const { notes } = await api['notes.list']({ subjectId: subject?.id ?? '' });
    expect(notes.map((note) => note.title)).toEqual(['Primero intentá, después mirá la respuesta']);
  });

  it('[CA-041] si no se puede guardar, avisa sin jerga y la pregunta sigue ahí con lo escrito', async () => {
    const { bridge, api, user } = openWindow();
    bridge.handlers['subjects.create'] = async () => {
      throw new Error('base bloqueada');
    };
    render(<App />);
    await user.type(
      await screen.findByRole('textbox', { name: QUESTION }),
      'Química orgánica{Enter}',
    );
    expect(await screen.findByText('No pude guardar esto. Probá de nuevo.')).toBeTruthy();
    expect(screen.queryByText(/base bloqueada/)).toBeNull();
    expect((field() as HTMLInputElement).value).toBe('Química orgánica');
    expect((await api['subjects.list']({})).subjects).toEqual([]);
  });

  it('con una materia ya creada no aparece: la ventana abre con el riel', async () => {
    const { api } = openWindow();
    await seedSubjects(api);
    render(<App />);
    expect(await screen.findByRole('navigation', { name: 'Riel lateral' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: QUESTION })).toBeNull();
  });
});

// Un puente con dos carpetas de datos, como la demostración: el elenco y la primera vez. Los tres
// canales de la demostración cambian de carpeta y el resto sigue la vigente.
function openDemoWithTwoFolders() {
  const cast = openWindow('prueba');
  const empty = openExtraBridge();
  let mode: 'cast' | 'first-time' = 'cast';
  const demoHandlers = createDemoHandlers(createDemoDate(cast.bridge.dataDir));
  const registry = demoChannels();
  const demoApi = buildApi(
    (channel, request) => handleMessage(demoHandlers, channel, request, registry),
    registry,
  );
  const own: Record<string, (request: never) => Promise<unknown>> = {
    'demo.dataMode': async () => ({ mode }),
    'demo.useFirstTime': async () => {
      mode = 'first-time';
      return { mode };
    },
    'demo.useCast': async () => {
      mode = 'cast';
      return { mode };
    },
    'demo.connection': async () => ({ offline: false }),
    'demo.setConnection': async () => ({ offline: false }),
  };
  const current = () => (mode === 'cast' ? cast.bridge.api : empty.api);
  window.retenia = new Proxy({} as Record<string, unknown>, {
    get: (_target, name: string) =>
      own[name] ??
      (name.startsWith('demo.')
        ? (demoApi as Record<string, unknown>)[name]
        : (current() as unknown as Record<string, unknown>)[name]),
  }) as unknown as typeof window.retenia;
  return { api: cast.bridge.api, user: userEvent.setup() };
}

describe('Ajustes › «Demostración»: la primera vez y el elenco', () => {
  it('[CA-041] «Empezar como la primera vez» deja la pregunta única, con la cinta y «Volver al elenco»; «Volver al elenco» deja Estudiar con el elenco', async () => {
    const { api, user } = openDemoWithTwoFolders();
    await seedSubjects(api);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Ajustes' }));
    expect(screen.queryByRole('button', { name: 'Volver al elenco' })).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Empezar como la primera vez' }));

    expect(await screen.findByRole('textbox', { name: QUESTION })).toBeTruthy();
    expect(rail()).toBeNull();
    expect(screen.getByText(/^DEMOSTRACIÓN · hoy es /)).toBeTruthy();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);

    await user.click(await screen.findByRole('button', { name: 'Volver al elenco' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Estudiar' })).toBeTruthy();
    expect(await main().findByText('Estadística básica')).toBeTruthy();
  });

  it('[CA-041] en la primera vez, «Probar con un ejemplo (3 min)» muestra «Ejemplo» con su etiqueta, y Ajustes ofrece «Volver al elenco» en lugar de «Empezar»', async () => {
    const { api, user } = openDemoWithTwoFolders();
    await seedSubjects(api);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Ajustes' }));
    await user.click(await screen.findByRole('button', { name: 'Empezar como la primera vez' }));
    await user.click(await screen.findByRole('button', { name: 'Probar con un ejemplo (3 min)' }));
    expect(await main().findByText('EJEMPLO')).toBeTruthy();

    await user.click(within(rail() as HTMLElement).getByRole('button', { name: 'Ajustes' }));
    expect(await screen.findByRole('button', { name: 'Volver al elenco' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Empezar como la primera vez' })).toBeNull();
  });

  it('si no se pueden cambiar los datos, avisa sin jerga y no cambia nada', async () => {
    const { api, user } = openWindow('prueba');
    await seedSubjects(api);
    window.retenia = {
      ...window.retenia,
      'demo.dataMode': async () => ({ mode: 'cast' }),
      'demo.useFirstTime': async () => {
        throw new Error('carpeta bloqueada');
      },
    } as unknown as typeof window.retenia;
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Ajustes' }));
    await user.click(await screen.findByRole('button', { name: 'Empezar como la primera vez' }));
    expect(
      await screen.findByText('No pude cambiar los datos de la demostración. Probá de nuevo.'),
    ).toBeTruthy();
    expect(screen.queryByText(/carpeta bloqueada/)).toBeNull();
    await waitFor(() => expect(rail()).not.toBeNull());
  });
});
