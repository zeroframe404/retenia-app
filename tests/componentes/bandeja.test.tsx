import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_INBOX_LENGTH } from '../../src/preload/contract/organization';
import { texts } from '../../src/preload/contract/texts';
import { App } from '../../src/renderer/App';
import { closeWindows, openWindow, seedSubjects } from './apoyo-ventana';

// La captura al vuelo (Ctrl+Mayús+N) y la Bandeja (H-11, CA-046 y CA-047), contra el puente real y
// una carpeta de datos real.

afterEach(closeWindows);

type User = ReturnType<typeof openWindow>['user'];

const rail = () => screen.getByRole('navigation', { name: 'Riel lateral' });
const badge = () => within(rail()).queryByRole('button', { name: /^Bandeja, / });
const CAPTURE = '{Control>}{Shift>}n{/Shift}{/Control}';

async function openCapture(user: User) {
  await user.keyboard(CAPTURE);
  return screen.findByRole('dialog', { name: 'Anotar al vuelo' });
}

async function capture(user: User, text: string) {
  const dialog = await openCapture(user);
  await user.type(
    within(dialog).getByRole('textbox', { name: 'Anotá lo que se te ocurrió' }),
    text,
  );
  await user.keyboard('{Enter}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

async function goTo(user: User, destination: string) {
  await user.click(within(rail()).getByRole('button', { name: destination }));
  await screen.findByRole('heading', { level: 2, name: destination });
}

async function openInbox(user: User) {
  await goTo(user, 'Apuntes');
  await user.click(
    within(screen.getByRole('navigation', { name: 'Secciones de Apuntes' })).getByRole('button', {
      name: /^Bandeja\b/,
    }),
  );
  await screen.findByRole('heading', { level: 3, name: 'Bandeja' });
}

const itemRow = (text: string) => {
  const found = within(screen.getByRole('list', { name: 'Elementos de la Bandeja' }))
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(text) !== null);
  if (!found) {
    throw new Error(`«${text}» no está en la Bandeja`);
  }
  return within(found);
};

describe('el contador de la Bandeja en el riel', () => {
  it('con la Bandeja vacía el riel es el de siempre: «Buscar» y los seis destinos, sin fila extra', async () => {
    const { api } = openWindow();
    await seedSubjects(api);
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    expect(
      within(rail())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'BuscarCtrl+K',
      'Estudiar',
      'Apuntes',
      'Materiales',
      'Idiomas',
      'Progreso',
      'Ajustes',
    ]);
    expect(badge()).toBeNull();
  });

  it('con algo en la Bandeja aparece justo debajo de «Apuntes»: nombre accesible «Bandeja, 2 elementos», sin ser un destino', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    await api['inbox.capture']({ text: 'Uno' });
    await api['inbox.capture']({ text: 'Dos' });
    render(<App />);
    const row = await within(rail()).findByRole('button', { name: 'Bandeja, 2 elementos' });
    expect(row.textContent).toContain('Bandeja');
    expect(row.textContent).toContain('2');
    expect(row.getAttribute('aria-current')).toBeNull();
    expect(row.getAttribute('aria-keyshortcuts')).toBeNull();
    const names = within(rail())
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(names.indexOf(row.textContent ?? '')).toBe(names.indexOf('Apuntes') + 1);
    expect(names).toHaveLength(8);

    // Los atajos Ctrl+1 a Ctrl+6 siguen abriendo los seis destinos de siempre.
    await user.keyboard('{Control>}3{/Control}');
    expect(await screen.findByRole('heading', { level: 2, name: 'Materiales' })).toBeTruthy();
  });

  it('con un solo elemento dice «Bandeja, 1 elemento»; tocarla abre Apuntes › «Bandeja»', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    await api['inbox.capture']({ text: 'Revisar el capítulo 4' });
    render(<App />);
    await user.click(await within(rail()).findByRole('button', { name: 'Bandeja, 1 elemento' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Apuntes' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 3, name: 'Bandeja' })).toBeTruthy();
    expect(await screen.findByText('Revisar el capítulo 4')).toBeTruthy();
    const tab = within(screen.getByRole('navigation', { name: 'Secciones de Apuntes' })).getByRole(
      'button',
      { name: /^Bandeja\b/ },
    );
    expect(tab.getAttribute('aria-current')).toBe('page');
    expect(tab.textContent).toContain('1');
  });
});

describe('la captura al vuelo', () => {
  it('[CA-046] Ctrl+Mayús+N desde Progreso abre el cuadro, escribir y Enter la deja en la Bandeja sin pedir materia ni tema, y sigue en Progreso', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    await goTo(user, 'Progreso');

    const dialog = await openCapture(user);
    // Una sola cosa para completar: sin materia ni tema.
    expect(within(dialog).getAllByRole('textbox')).toHaveLength(1);
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    const field = within(dialog).getByRole('textbox', { name: 'Anotá lo que se te ocurrió' });
    expect(document.activeElement).toBe(field);
    expect(
      within(dialog).getByRole('button', { name: 'Guardar' }).getAttribute('data-button'),
    ).toBe('primary');
    await user.type(field, 'Revisar teorema central del límite');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('heading', { level: 2, name: 'Progreso' })).toBeTruthy();
    expect(await screen.findByText('Anotado en la Bandeja.')).toBeTruthy();
    const row = await within(rail()).findByRole('button', { name: 'Bandeja, 1 elemento' });
    expect(row.textContent).toContain('1');
    const { items, count } = await api['inbox.list']({});
    expect(count).toBe(1);
    expect(items.map((item) => item.text)).toEqual(['Revisar teorema central del límite']);
    // El foco vuelve a donde estaba.
    expect(document.activeElement).not.toBe(field);
  });

  it('[CA-046] anda desde cualquier pantalla y no cambia de pantalla: Estudiar, Apuntes y Ajustes', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    for (const [index, destination] of ['Estudiar', 'Apuntes', 'Ajustes'].entries()) {
      await goTo(user, destination);
      await capture(user, `Idea ${index + 1}`);
      expect(screen.getByRole('heading', { level: 2, name: destination })).toBeTruthy();
    }
    expect((await api['inbox.list']({})).items.map((item) => item.text)).toEqual([
      'Idea 3',
      'Idea 2',
      'Idea 1',
    ]);
    expect(
      await within(rail()).findByRole('button', { name: 'Bandeja, 3 elementos' }),
    ).toBeTruthy();
  });

  it('[CA-046] el botón «Guardar» hace lo mismo que Enter', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    const dialog = await openCapture(user);
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Anotá lo que se te ocurrió' }),
      'Con el botón',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await api['inbox.list']({})).items.map((item) => item.text)).toEqual(['Con el botón']);
  });

  it('[CA-046] un texto vacío no se guarda: avisa, deja el foco en el campo y Esc cierra el cuadro devolviendo el foco', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    render(<App />);
    const study = await within(
      await screen.findByRole('navigation', { name: 'Riel lateral' }),
    ).findByRole('button', { name: 'Estudiar' });
    study.focus();
    const dialog = await openCapture(user);
    await user.keyboard('{Enter}');
    expect(await within(dialog).findByText('Escribí algo para anotar')).toBeTruthy();
    expect(document.activeElement).toBe(
      within(dialog).getByRole('textbox', { name: 'Anotá lo que se te ocurrió' }),
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(study);
    expect((await api['inbox.list']({})).count).toBe(0);
    expect(badge()).toBeNull();
  });

  it('[CA-046] un texto larguísimo avisa el máximo y no se guarda', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    const dialog = await openCapture(user);
    const field = within(dialog).getByRole('textbox', { name: 'Anotá lo que se te ocurrió' });
    // Pegar de una vez: escribir mil caracteres de a uno tarda demasiado.
    await user.click(field);
    await user.paste('a'.repeat(MAX_INBOX_LENGTH + 1));
    await user.keyboard('{Enter}');
    expect(
      await within(dialog).findByText(texts.inbox.captureTooLong(MAX_INBOX_LENGTH)),
    ).toBeTruthy();
    expect((await api['inbox.list']({})).count).toBe(0);
  });

  it('[CA-046] si no se puede guardar, avisa sin jerga y lo escrito sigue ahí', async () => {
    const { bridge, api, user } = openWindow();
    await seedSubjects(api);
    bridge.handlers['inbox.capture'] = async () => {
      throw new Error('base bloqueada');
    };
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    const dialog = await openCapture(user);
    const field = within(dialog).getByRole('textbox', { name: 'Anotá lo que se te ocurrió' });
    await user.type(field, 'Algo importante{Enter}');
    expect(await within(dialog).findByText('No pude anotarlo. Probá de nuevo.')).toBeTruthy();
    expect(screen.queryByText(/base bloqueada/)).toBeNull();
    expect((field as HTMLInputElement).value).toBe('Algo importante');
  });

  it('con otro cuadro abierto no abre uno nuevo, ni siquiera con el suyo ya abierto', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Cambiar' }));
    await screen.findByRole('dialog', { name: 'Tus materias' });
    await user.keyboard(CAPTURE);
    expect(screen.queryByRole('dialog', { name: 'Anotar al vuelo' })).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await openCapture(user);
    await user.keyboard(CAPTURE);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('Ctrl+Mayús+N solo responde a esa combinación: Ctrl+N y Alt+Mayús+N no abren el cuadro', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    await user.keyboard('{Control>}n{/Control}');
    await user.keyboard('{Alt>}{Shift>}n{/Shift}{/Alt}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('la Bandeja', () => {
  it('[CA-047] cada elemento muestra su texto y el día; «Mover a…» lo pasa a una nota del tema y el contador baja en uno', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedSubjects(api);
    const intervals = await api['topics.create']({
      subjectId: statistics.id,
      name: 'Intervalos de confianza',
    });
    await api['inbox.capture']({ text: 'Revisar teorema central del límite' });
    await api['inbox.capture']({ text: 'Buscar un ejemplo de intervalo' });
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    await openInbox(user);
    expect(await screen.findByRole('list', { name: 'Elementos de la Bandeja' })).toBeTruthy();
    expect(itemRow('Revisar teorema central del límite').getByText('15/03/2027')).toBeTruthy();
    expect(
      await within(rail()).findByRole('button', { name: 'Bandeja, 2 elementos' }),
    ).toBeTruthy();

    await user.click(
      itemRow('Revisar teorema central del límite').getByRole('button', { name: 'Mover a…' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Mover a…' });
    await user.click(within(dialog).getByRole('button', { name: 'Intervalos de confianza' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Pasó a «Intervalos de confianza» como nota.')).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByText('Revisar teorema central del límite')).toBeNull(),
    );
    expect(await within(rail()).findByRole('button', { name: 'Bandeja, 1 elemento' })).toBeTruthy();
    const tab = within(screen.getByRole('navigation', { name: 'Secciones de Apuntes' })).getByRole(
      'button',
      { name: /^Bandeja\b/ },
    );
    expect(tab.textContent).toContain('1');
    expect(itemRow('Buscar un ejemplo de intervalo')).toBeTruthy();

    const { notes } = await api['notes.list']({ subjectId: statistics.id });
    const moved = notes.find((note) => note.title === 'Revisar teorema central del límite');
    expect(moved?.topicId).toBe(intervals.id);
    expect((await api['inbox.list']({})).count).toBe(1);

    // La nota aparece en su tema.
    await user.click(
      within(screen.getByRole('navigation', { name: 'Secciones de Apuntes' })).getByRole('button', {
        name: 'Notas',
      }),
    );
    await user.click(await screen.findByRole('button', { name: /^Intervalos de confianza/ }));
    expect(
      await screen.findByRole('button', { name: 'Revisar teorema central del límite' }),
    ).toBeTruthy();
  });

  it('[CA-047] cuando no queda nada, dice que la Bandeja está vacía y el riel vuelve a no mostrar el contador', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedSubjects(api);
    await api['topics.create']({ subjectId: statistics.id, name: 'Media y dispersión' });
    await api['inbox.capture']({ text: 'Un solo elemento' });
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    await openInbox(user);
    await user.click(await screen.findByRole('button', { name: 'Mover a…' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Mover a…' })).getByRole('button', {
        name: 'Media y dispersión',
      }),
    );
    expect(await screen.findByText(/^La Bandeja está vacía/)).toBeTruthy();
    await waitFor(() => expect(badge()).toBeNull());
    const tab = within(screen.getByRole('navigation', { name: 'Secciones de Apuntes' })).getByRole(
      'button',
      { name: 'Bandeja' },
    );
    expect(tab.textContent).toBe('Bandeja');
  });

  it('«Mover a…» ofrece los temas de la materia que se mira, no los de otra, y no los archivados', async () => {
    const { api, user } = openWindow();
    const { statistics, history } = await seedSubjects(api);
    await api['topics.create']({ subjectId: statistics.id, name: 'Media y dispersión' });
    const old = await api['topics.create']({ subjectId: statistics.id, name: 'Tema viejo' });
    await api['topics.archive']({ topicId: old.id });
    await api['topics.create']({ subjectId: history.id, name: 'Independencia' });
    await api['inbox.capture']({ text: 'Algo' });
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    await openInbox(user);
    await user.click(await screen.findByRole('button', { name: 'Mover a…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mover a…' });
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label') ?? button.textContent),
    ).toEqual(['Cerrar', 'Media y dispersión']);
  });

  it('sin temas en la materia, «Mover a…» lo dice', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    await api['inbox.capture']({ text: 'Algo' });
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    await openInbox(user);
    await user.click(await screen.findByRole('button', { name: 'Mover a…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mover a…' });
    expect(
      within(dialog).getByText('Esta materia todavía no tiene temas. Creá uno en Notas y volvé.'),
    ).toBeTruthy();
  });

  it('«Eliminar» manda el elemento a la Papelera, el contador baja y «Deshacer» lo devuelve', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    await api['inbox.capture']({ text: 'Algo que ya no sirve' });
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    await openInbox(user);
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('El elemento está en la Papelera.')).toBeTruthy();
    expect(await screen.findByText(/^La Bandeja está vacía/)).toBeTruthy();
    await waitFor(() => expect(badge()).toBeNull());
    expect(
      (await api['trash.listOrganization']({})).items.map((item) => [item.kind, item.name]),
    ).toEqual([['inbox', 'Algo que ya no sirve']]);

    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByText('Algo que ya no sirve')).toBeTruthy();
    expect(await within(rail()).findByRole('button', { name: 'Bandeja, 1 elemento' })).toBeTruthy();
  });

  it('la Bandeja vacía dice cómo anotar al vuelo y no ofrece acciones', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    await openInbox(user);
    expect(
      await screen.findByText(
        'La Bandeja está vacía. Con Ctrl+Mayús+N anotás algo al vuelo desde cualquier pantalla.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Elementos de la Bandeja' })).toBeNull();
  });

  it('si no se puede leer la Bandeja, lo dice y «Reintentar» la vuelve a pedir', async () => {
    const { bridge, api, user } = openWindow();
    await seedSubjects(api);
    await api['inbox.capture']({ text: 'Algo' });
    const original = bridge.handlers['inbox.list'];
    render(<App />);
    await within(await screen.findByRole('navigation', { name: 'Riel lateral' })).findByRole(
      'button',
      {
        name: 'Bandeja, 1 elemento',
      },
    );
    bridge.handlers['inbox.list'] = async () => {
      throw new Error('base bloqueada');
    };
    await openInbox(user);
    expect(await screen.findByText('No pude cargar la Bandeja. Probá de nuevo.')).toBeTruthy();
    expect(screen.queryByText(/base bloqueada/)).toBeNull();
    bridge.handlers['inbox.list'] = original;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Algo')).toBeTruthy();
  });

  it('un elemento de la Papelera que se restaura vuelve a la Bandeja y el contador lo cuenta', async () => {
    const { api, user } = openWindow();
    await seedSubjects(api);
    await api['inbox.capture']({ text: 'Volvé a la Bandeja' });
    const { items } = await api['inbox.list']({});
    await api['inbox.delete']({ itemId: items[0]?.id ?? '' });
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    expect(badge()).toBeNull();
    await goTo(user, 'Apuntes');
    await user.click(
      within(screen.getByRole('navigation', { name: 'Secciones de Apuntes' })).getByRole('button', {
        name: 'Papelera',
      }),
    );
    const list = await screen.findByRole('list', { name: 'Elementos en la papelera' });
    await user.click(within(list).getByRole('button', { name: 'Restaurar' }));
    expect(await within(rail()).findByRole('button', { name: 'Bandeja, 1 elemento' })).toBeTruthy();
  });

  it('un tema que no se puede restaurar porque su nombre está en uso lo dice con sus palabras', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedSubjects(api);
    const first = await api['topics.create']({ subjectId: statistics.id, name: 'Regresión' });
    await api['topics.delete']({ topicId: first.id });
    await api['topics.create']({ subjectId: statistics.id, name: 'Regresión' });
    render(<App />);
    await screen.findByRole('navigation', { name: 'Riel lateral' });
    await goTo(user, 'Apuntes');
    await user.click(
      within(screen.getByRole('navigation', { name: 'Secciones de Apuntes' })).getByRole('button', {
        name: 'Papelera',
      }),
    );
    const list = await screen.findByRole('list', { name: 'Elementos en la papelera' });
    await user.click(within(list).getByRole('button', { name: 'Restaurar' }));
    expect(
      await screen.findByText('No pude restaurar el tema: ya hay otro con ese nombre.'),
    ).toBeTruthy();
    expect(screen.queryByText('Esa tarjeta ya no está en la papelera.')).toBeNull();
  });
});
