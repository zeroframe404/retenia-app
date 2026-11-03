import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';
import { closeWindows, openWindow, seedNote, seedSubjects } from './apoyo-ventana';

// Estudiar con la materia activa, el cuadro «Cambiar» y «Nueva materia» (H-09, CA-038 y CA-039),
// contra el puente real y una carpeta de datos real.

afterEach(closeWindows);

const rail = () => screen.getByRole('navigation', { name: 'Riel lateral' });
const main = () => within(screen.getByRole('main'));

async function openSubjects(user: ReturnType<typeof openWindow>['user']) {
  await user.click(await screen.findByRole('button', { name: 'Cambiar' }));
  return screen.findByRole('dialog', { name: 'Tus materias' });
}

const row = (dialog: HTMLElement, name: string) => {
  const found = within(dialog)
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(name) !== null);
  if (!found) {
    throw new Error(`No hay una materia «${name}» en la lista`);
  }
  return found;
};

describe('Estudiar con la materia activa', () => {
  it('muestra arriba la materia activa con su nombre y «Cambiar», y sigue con «Todavía no disponible» y «Ir a Apuntes»', async () => {
    const { api } = openWindow();
    await seedSubjects(api);
    render(<App />);
    expect(await main().findByText('Materia activa')).toBeTruthy();
    expect(main().getByText('Estadística básica')).toBeTruthy();
    expect(main().getByRole('button', { name: 'Cambiar' })).toBeTruthy();
    expect(main().getByText(/^Todavía no disponible\./)).toBeTruthy();
    expect(main().getByRole('button', { name: 'Ir a Apuntes' })).toBeTruthy();
    expect(main().queryByText('Historia argentina')).toBeNull();
  });

  it('con la materia de ejemplo activa, su nombre lleva la etiqueta EJEMPLO', async () => {
    const { api } = openWindow();
    await api['subjects.createExample']({});
    render(<App />);
    expect(await main().findByText('Ejemplo')).toBeTruthy();
    expect(main().getByText('EJEMPLO')).toBeTruthy();
  });

  it('sin una materia activa dice «Todavía no tenés una materia activa.» y deja elegir con «Cambiar»', async () => {
    const { bridge } = openWindow();
    bridge.workspace.subjects.createExample({ activate: false });
    render(<App />);
    expect(await main().findByText('Todavía no tenés una materia activa.')).toBeTruthy();
    expect(main().getByRole('button', { name: 'Cambiar' })).toBeTruthy();
  });

  it('si no se pueden leer las materias, lo dice sin jerga y «Reintentar» las vuelve a pedir', async () => {
    const { bridge, api, user } = openWindow();
    await seedSubjects(api);
    const original = bridge.handlers['subjects.list'];
    bridge.handlers['subjects.list'] = async () => {
      throw new Error('base bloqueada');
    };
    render(<App />);
    expect(await screen.findByText('No pude cargar tus materias. Probá de nuevo.')).toBeTruthy();
    expect(screen.queryByText(/base bloqueada/)).toBeNull();
    bridge.handlers['subjects.list'] = original;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await main().findByText('Estadística básica')).toBeTruthy();
  });
});

describe('«Cambiar»: la lista de materias', () => {
  it('[CA-038] lista cada materia con su estado («Activa», «En mantenimiento», «En pausa»), la etiqueta EJEMPLO y «Abrir»; «Hacer activa» no está en la activa', async () => {
    const { bridge, api, user } = openWindow();
    await seedSubjects(api);
    bridge.workspace.subjects.createExample({ activate: false });
    render(<App />);
    const dialog = await openSubjects(user);
    const list = within(dialog).getByRole('list', { name: 'Materias' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);

    const active = row(dialog, 'Estadística básica');
    expect(within(active).getByText('Activa')).toBeTruthy();
    expect(within(active).getByRole('button', { name: 'Abrir' })).toBeTruthy();
    expect(within(active).queryByRole('button', { name: 'Hacer activa' })).toBeNull();

    const history = row(dialog, 'Historia argentina');
    expect(within(history).getByText('En mantenimiento')).toBeTruthy();
    expect(within(history).getByRole('button', { name: 'Hacer activa' })).toBeTruthy();

    const example = row(dialog, 'Ejemplo');
    expect(within(example).getByText('En pausa')).toBeTruthy();
    expect(within(example).getByText('EJEMPLO')).toBeTruthy();
  });

  it('[CA-038] «Nueva materia», «Química orgánica» y «Hacer activa»: Estudiar la muestra y «Estadística básica» pasa a «En mantenimiento»', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    render(<App />);
    const dialog = await openSubjects(user);

    await user.click(within(dialog).getByRole('button', { name: 'Nueva materia' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Nombre' }), 'Química orgánica');
    await user.click(within(dialog).getByRole('button', { name: 'Crear' }));

    // La materia nueva nace en mantenimiento: no se activa sola.
    const created = await waitFor(() => row(dialog, 'Química orgánica'));
    expect(within(created).getByText('En mantenimiento')).toBeTruthy();
    expect(within(dialog).queryByRole('textbox', { name: 'Nombre' })).toBeNull();
    expect(main().queryByText('Química orgánica')).toBeNull();

    await user.click(within(created).getByRole('button', { name: 'Hacer activa' }));
    expect(
      await within(dialog).findByText('«Química orgánica» es ahora tu materia activa.'),
    ).toBeTruthy();
    // La lista se actualiza en el lugar y el cuadro sigue abierto.
    expect(within(row(dialog, 'Química orgánica')).getByText('Activa')).toBeTruthy();
    expect(within(row(dialog, 'Estadística básica')).getByText('En mantenimiento')).toBeTruthy();
    expect(
      within(row(dialog, 'Química orgánica')).queryByRole('button', { name: 'Hacer activa' }),
    ).toBeNull();
    // Estudiar, detrás del cuadro, ya muestra la nueva.
    expect(main().getByText('Química orgánica')).toBeTruthy();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(main().getByText('Química orgánica')).toBeTruthy();
    expect(main().queryByText('Estadística básica')).toBeNull();
    const { subjects } = await api['subjects.list']({});
    expect(subjects.map((s) => [s.name, s.status])).toEqual([
      ['Química orgánica', 'active'],
      ['Estadística básica', 'maintenance'],
      ['Historia argentina', 'maintenance'],
    ]);
  });

  it('[CA-038] Enter en el campo crea la materia y «Cancelar» cierra el formulario sin crear nada', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    render(<App />);
    const dialog = await openSubjects(user);

    await user.click(within(dialog).getByRole('button', { name: 'Nueva materia' }));
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(within(dialog).queryByRole('textbox', { name: 'Nombre' })).toBeNull();
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2);

    await user.click(within(dialog).getByRole('button', { name: 'Nueva materia' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Nombre' }), 'Álgebra{Enter}');
    await waitFor(() => expect(within(dialog).getAllByRole('listitem')).toHaveLength(3));
    expect(row(dialog, 'Álgebra')).toBeTruthy();
  });

  it('[CA-038] el nombre no puede estar vacío, ser larguísimo ni repetir otro (sin distinguir mayúsculas ni espacios)', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    render(<App />);
    const dialog = await openSubjects(user);
    await user.click(within(dialog).getByRole('button', { name: 'Nueva materia' }));
    const field = () => within(dialog).getByRole('textbox', { name: 'Nombre' });

    await user.click(within(dialog).getByRole('button', { name: 'Crear' }));
    expect(await within(dialog).findByText('Escribí el nombre de la materia')).toBeTruthy();
    expect(document.activeElement).toBe(field());

    await user.type(field(), '  estadística   BÁSICA ');
    await user.click(within(dialog).getByRole('button', { name: 'Crear' }));
    expect(await within(dialog).findByText('Ya tenés una materia con ese nombre')).toBeTruthy();

    await user.clear(field());
    await user.type(field(), 'a'.repeat(121));
    await user.click(within(dialog).getByRole('button', { name: 'Crear' }));
    expect(
      await within(dialog).findByText('El nombre es demasiado largo: el máximo es 120 caracteres'),
    ).toBeTruthy();

    expect(within(dialog).getAllByRole('listitem')).toHaveLength(2);
    expect((await api['subjects.list']({})).subjects).toHaveLength(2);
  });

  it('si no se puede activar, avisa sin jerga y no cambia nada', async () => {
    const { bridge, api, user } = openWindow();
    await seedSubjects(api);
    bridge.handlers['subjects.activate'] = async () => {
      throw new Error('base bloqueada');
    };
    render(<App />);
    const dialog = await openSubjects(user);
    await user.click(
      within(row(dialog, 'Historia argentina')).getByRole('button', { name: 'Hacer activa' }),
    );
    expect(await within(dialog).findByText('No pude completar esto. Probá de nuevo.')).toBeTruthy();
    expect(screen.queryByText(/base bloqueada/)).toBeNull();
    expect(within(row(dialog, 'Estadística básica')).getByText('Activa')).toBeTruthy();
  });

  it('Esc cierra el cuadro y el foco vuelve a «Cambiar»', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    render(<App />);
    const change = await screen.findByRole('button', { name: 'Cambiar' });
    await user.click(change);
    await screen.findByRole('dialog', { name: 'Tus materias' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(change);
  });
});

describe('abrir una materia para consultarla', () => {
  it('[CA-039] «Abrir» «Historia argentina» muestra sus apuntes y no cambia la activa: Estudiar sigue con «Estadística básica»', async () => {
    const { api, user } = openWindow();
    const { statistics, history } = await seedSubjects(api);
    await seedNote(api, { subjectId: statistics.id, title: 'Media y desvío' });
    await seedNote(api, { subjectId: history.id, title: 'Revolución de Mayo' });
    render(<App />);
    const dialog = await openSubjects(user);
    await user.click(
      within(row(dialog, 'Historia argentina')).getByRole('button', { name: 'Abrir' }),
    );

    expect(await screen.findByRole('heading', { level: 2, name: 'Apuntes' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await main().findByText('Estás mirando: Historia argentina')).toBeTruthy();
    expect(main().getByText('Materia activa: Estadística básica')).toBeTruthy();
    expect(await main().findByRole('button', { name: 'Revolución de Mayo' })).toBeTruthy();
    expect(main().queryByRole('button', { name: 'Media y desvío' })).toBeNull();

    // La activa no se movió: ni en pantalla ni en los datos.
    await user.click(within(rail()).getByRole('button', { name: 'Estudiar' }));
    expect(await main().findByText('Estadística básica')).toBeTruthy();
    expect(main().queryByText('Historia argentina')).toBeNull();
    const { subjects } = await api['subjects.list']({});
    expect(subjects.find((s) => s.status === 'active')?.name).toBe('Estadística básica');
  });

  it('[CA-039] «Hacer activa» en «Historia argentina» recién ahí cambia la materia activa', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    render(<App />);
    const dialog = await openSubjects(user);
    await user.click(
      within(row(dialog, 'Historia argentina')).getByRole('button', { name: 'Hacer activa' }),
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(main().getByText('Historia argentina')).toBeTruthy());
    expect(main().queryByText('Estadística básica')).toBeNull();
  });

  it('[CA-039] mirar la activa dice «Estás mirando tu materia activa»; al abrir otra, mira esa y nombra la activa', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Ir a Apuntes' }));
    expect(
      await main().findByText('Estás mirando tu materia activa: Estadística básica'),
    ).toBeTruthy();
    expect(main().queryByText(/^Materia activa: /)).toBeNull();

    await user.click(main().getByRole('button', { name: 'Cambiar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tus materias' });
    await user.click(
      within(row(dialog, 'Historia argentina')).getByRole('button', { name: 'Abrir' }),
    );
    expect(await main().findByText('Estás mirando: Historia argentina')).toBeTruthy();
    expect(main().getByText('Materia activa: Estadística básica')).toBeTruthy();
  });
});
