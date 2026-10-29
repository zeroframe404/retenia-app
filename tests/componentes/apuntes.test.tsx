import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/App';
import { closeWindows, openWindow, seedNote, seedSubjects } from './apoyo-ventana';

// Apuntes › «Notas»: los temas, la lista de notas y sus acciones (H-09, CA-040, CA-044 y CA-045),
// contra el puente real y una carpeta de datos real. El editor de la nota es de otro frente: acá
// es un doble que muestra con qué lo abre la pantalla; el editor de verdad se prueba en
// apuntes-con-editor.test.tsx y en la punta a punta.

const editor = vi.hoisted(() => ({ target: { noteId: '', blockId: '' } }));
vi.mock('../../src/renderer/notes/NoteEditor', async () => {
  const { createElement: h } = await import('react');
  return {
    NoteEditor: (props: {
      note: { title: string; id: string };
      focusBlockId?: string | null;
      autoFocusTitle?: boolean;
      onBack: () => void;
      onOpenNote: (noteId: string, blockId?: string) => void;
      onSaved?: () => void;
    }) =>
      h(
        'section',
        { 'aria-label': 'Editor de prueba' },
        h('h3', null, props.note.title === '' ? 'Sin título' : props.note.title),
        h('p', null, `foco en el título: ${String(props.autoFocusTitle ?? false)}`),
        h('p', null, `renglón: ${props.focusBlockId ?? 'ninguno'}`),
        h('button', { type: 'button', onClick: props.onBack }, 'Volver a las notas'),
        h('button', { type: 'button', onClick: () => props.onSaved?.() }, 'Simular guardado'),
        h(
          'button',
          {
            type: 'button',
            onClick: () => props.onOpenNote(editor.target.noteId, editor.target.blockId),
          },
          'Simular enlace',
        ),
      ),
  };
});

afterEach(closeWindows);

const rail = () => screen.getByRole('navigation', { name: 'Riel lateral' });
const main = () => within(screen.getByRole('main'));
const topics = () => within(screen.getByRole('navigation', { name: 'Temas' }));
const topic = (name: string) => topics().getByRole('button', { name: new RegExp(`^${name}`) });
const notesList = (label = 'Notas') => within(screen.getByRole('list', { name: label }));
const noteRow = (title: string, label = 'Notas') => {
  const found = notesList(label).getByRole('button', { name: title }).closest('li');
  if (!found) {
    throw new Error(`La nota «${title}» no está en un renglón de la lista`);
  }
  return within(found);
};

type User = ReturnType<typeof openWindow>['user'];

async function openNotes(user: User) {
  await user.click(within(rail()).getByRole('button', { name: 'Apuntes' }));
  await screen.findByRole('heading', { level: 3, name: 'Notas' });
  await screen.findByRole('navigation', { name: 'Temas' });
}

async function seedStatistics(api: ReturnType<typeof openWindow>['api']) {
  const { statistics, history } = await seedSubjects(api);
  const media = await api['topics.create']({
    subjectId: statistics.id,
    name: 'Media y dispersión',
  });
  const intervals = await api['topics.create']({
    subjectId: statistics.id,
    name: 'Intervalos de confianza',
  });
  const note = await seedNote(api, {
    subjectId: statistics.id,
    topicId: media.id,
    title: 'Media y desvío',
  });
  return { statistics, history, media, intervals, note };
}

describe('Apuntes › «Notas»: la pantalla', () => {
  it('abre en «Notas» con sus cinco secciones, el título «Notas» y «Nueva nota» como único botón primario', async () => {
    const { api, user } = openWindow();
    await seedStatistics(api);
    render(<App />);
    await openNotes(user);

    const sections = within(screen.getByRole('navigation', { name: 'Secciones de Apuntes' }));
    expect(sections.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Notas',
      'Bandeja',
      'Tarjetas',
      'Papelera',
      'Actividad reciente',
    ]);
    expect(sections.getByRole('button', { name: 'Notas' }).getAttribute('aria-current')).toBe(
      'page',
    );
    const primaries = [...document.querySelectorAll('main [data-button="primary"]')].map(
      (button) => button.textContent,
    );
    expect(primaries).toEqual(['Nueva nota']);
  });

  it('lista los temas de la materia que se mira: «Todas las notas», cada tema con su cantidad, «Sin tema» y «Archivadas»', async () => {
    const { api, user } = openWindow();
    await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    expect(
      topics()
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'Todas las notas',
      'Media y dispersión · 1',
      'Intervalos de confianza · 0',
      'Sin tema',
      'Archivadas',
    ]);
    expect(topic('Todas las notas').getAttribute('aria-current')).toBe('true');
    expect(topic('Sin tema').getAttribute('aria-current')).toBeNull();
    await user.click(topic('Media y dispersión'));
    expect(topic('Media y dispersión').getAttribute('aria-current')).toBe('true');
    expect(topic('Todas las notas').getAttribute('aria-current')).toBeNull();
  });

  it('en «Todas las notas» cada nota dice su tema o «Sin tema»; con un tema elegido solo se ven las suyas', async () => {
    const { api, user } = openWindow();
    const { statistics, intervals } = await seedStatistics(api);
    await seedNote(api, { subjectId: statistics.id, title: 'Idea suelta' });
    await seedNote(api, {
      subjectId: statistics.id,
      topicId: intervals.id,
      title: 'Error estándar',
    });
    render(<App />);
    await openNotes(user);

    expect(await notesList().findByRole('button', { name: 'Idea suelta' })).toBeTruthy();
    expect(noteRow('Media y desvío').getByText('Tema: Media y dispersión')).toBeTruthy();
    expect(noteRow('Idea suelta').getByText('Sin tema')).toBeTruthy();
    expect(noteRow('Error estándar').getByText('Tema: Intervalos de confianza')).toBeTruthy();

    await user.click(topic('Intervalos de confianza'));
    expect(notesList().getAllByRole('listitem')).toHaveLength(1);
    expect(notesList().getByRole('button', { name: 'Error estándar' })).toBeTruthy();
    expect(notesList().queryByRole('button', { name: 'Media y desvío' })).toBeNull();
  });

  it('muestra los temas y las notas de la materia que se mira, no los de la activa', async () => {
    const { api, user } = openWindow();
    const { history } = await seedStatistics(api);
    const independence = await api['topics.create']({
      subjectId: history.id,
      name: 'Independencia',
    });
    await seedNote(api, {
      subjectId: history.id,
      topicId: independence.id,
      title: 'Revolución de Mayo',
    });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Cambiar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tus materias' });
    const historyRow = within(dialog)
      .getAllByRole('listitem')
      .find((item) => within(item).queryByText('Historia argentina') !== null) as HTMLElement;
    await user.click(within(historyRow).getByRole('button', { name: 'Abrir' }));

    await screen.findByRole('navigation', { name: 'Temas' });
    expect(await topics().findByRole('button', { name: 'Independencia · 1' })).toBeTruthy();
    expect(topics().queryByRole('button', { name: /^Media y dispersión/ })).toBeNull();
    expect(await notesList().findByRole('button', { name: 'Revolución de Mayo' })).toBeTruthy();
  });
});

describe('temas', () => {
  it('[CA-040] «Nuevo tema» crea el tema «Regresión» y aparece en la lista; «Cancelar» cierra el formulario sin crear nada', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedStatistics(api);
    render(<App />);
    await openNotes(user);

    await user.click(screen.getByRole('button', { name: 'Nuevo tema' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('textbox', { name: 'Nombre del tema' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Nuevo tema' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Nombre del tema' }));
    await user.type(screen.getByRole('textbox', { name: 'Nombre del tema' }), 'Regresión');
    await user.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await topics().findByRole('button', { name: 'Regresión · 0' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Nombre del tema' })).toBeNull();
    const { topics: stored } = await api['topics.list']({ subjectId: statistics.id });
    expect(stored.map((t) => t.name)).toEqual([
      'Media y dispersión',
      'Intervalos de confianza',
      'Regresión',
    ]);
  });

  it('el nombre de un tema no puede estar vacío, ser larguísimo ni repetir otro de la materia', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(screen.getByRole('button', { name: 'Nuevo tema' }));
    const field = () => screen.getByRole('textbox', { name: 'Nombre del tema' });

    await user.click(screen.getByRole('button', { name: 'Crear' }));
    expect(await screen.findByText('Escribí el nombre del tema')).toBeTruthy();
    expect(document.activeElement).toBe(field());

    await user.type(field(), '  media Y   dispersión ');
    await user.click(screen.getByRole('button', { name: 'Crear' }));
    expect(await screen.findByText('Ya tenés un tema con ese nombre en esta materia')).toBeTruthy();

    await user.clear(field());
    await user.type(field(), 'a'.repeat(121));
    await user.click(screen.getByRole('button', { name: 'Crear' }));
    expect(
      await screen.findByText('El nombre es demasiado largo: el máximo es 120 caracteres'),
    ).toBeTruthy();
    expect((await api['topics.list']({ subjectId: statistics.id })).topics).toHaveLength(2);
  });

  it('las acciones del tema («Renombrar», «Detalles», «Archivar tema» y «Eliminar tema») solo aparecen con un tema elegido', async () => {
    const { api, user } = openWindow();
    await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    const actions = ['Renombrar', 'Detalles', 'Archivar tema', 'Eliminar tema'];
    for (const name of ['Todas las notas', 'Sin tema', 'Archivadas']) {
      await user.click(topic(name));
      for (const action of actions) {
        expect(screen.queryByRole('button', { name: action }), `${name}: ${action}`).toBeNull();
      }
    }
    await user.click(topic('Media y dispersión'));
    for (const action of actions) {
      expect(main().getByRole('button', { name: action })).toBeTruthy();
    }
  });

  it('[CA-044] «Renombrar» abre un cuadro con el nombre actual; al guardar el tema se llama distinto en la lista', async () => {
    const { api, user } = openWindow();
    const { media } = await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(topic('Media y dispersión'));
    await user.click(screen.getByRole('button', { name: 'Renombrar' }));

    const dialog = await screen.findByRole('dialog', { name: 'Renombrar el tema' });
    const field = within(dialog).getByRole('textbox', {
      name: 'Nombre del tema',
    }) as HTMLInputElement;
    expect(field.value).toBe('Media y dispersión');
    await user.clear(field);
    await user.type(field, 'Medidas de resumen');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await topics().findByRole('button', { name: 'Medidas de resumen · 1' })).toBeTruthy();
    expect(topics().queryByRole('button', { name: /^Media y dispersión/ })).toBeNull();
    // Sigue elegido el mismo tema y su nota sigue ahí.
    expect(topic('Medidas de resumen').getAttribute('aria-current')).toBe('true');
    expect(notesList().getByRole('button', { name: 'Media y desvío' })).toBeTruthy();
    const { topics: stored } = await api['topics.list']({ subjectId: media.subjectId });
    expect(stored.find((t) => t.id === media.id)?.name).toBe('Medidas de resumen');
  });

  it('[CA-044] el nombre viejo queda en «Otros nombres» dentro de «Detalles», con la cantidad de notas', async () => {
    const { api, user } = openWindow();
    await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(topic('Media y dispersión'));
    await user.click(screen.getByRole('button', { name: 'Renombrar' }));
    const rename = await screen.findByRole('dialog', { name: 'Renombrar el tema' });
    const field = within(rename).getByRole('textbox', { name: 'Nombre del tema' });
    await user.clear(field);
    await user.type(field, 'Medidas de resumen{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(await screen.findByRole('button', { name: 'Detalles' }));
    const details = await screen.findByRole('dialog', { name: 'Detalles de «Medidas de resumen»' });
    expect(within(details).getByText('1 nota')).toBeTruthy();
    expect(within(details).getByRole('heading', { name: 'Otros nombres' })).toBeTruthy();
    const aliases = within(details).getByRole('list', { name: 'Otros nombres' });
    expect(
      within(aliases)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Media y dispersión']);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('[CA-044] un tema que nunca cambió de nombre dice que todavía no tiene otros nombres', async () => {
    const { api, user } = openWindow();
    await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(topic('Intervalos de confianza'));
    await user.click(screen.getByRole('button', { name: 'Detalles' }));
    const details = await screen.findByRole('dialog', {
      name: 'Detalles de «Intervalos de confianza»',
    });
    expect(within(details).getByText('0 notas')).toBeTruthy();
    expect(within(details).getByText('Todavía no tiene otros nombres.')).toBeTruthy();
    expect(within(details).queryByRole('list')).toBeNull();
  });

  it('[CA-044] renombrar con un nombre vacío o repetido avisa en el cuadro y no cambia nada', async () => {
    const { api, user } = openWindow();
    await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(topic('Media y dispersión'));
    await user.click(screen.getByRole('button', { name: 'Renombrar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renombrar el tema' });
    const field = within(dialog).getByRole('textbox', { name: 'Nombre del tema' });
    await user.clear(field);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText('Escribí el nombre del tema')).toBeTruthy();
    await user.type(field, 'intervalos de confianza');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(
      await within(dialog).findByText('Ya tenés un tema con ese nombre en esta materia'),
    ).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(await topics().findByRole('button', { name: 'Media y dispersión · 1' })).toBeTruthy();
  });

  it('[CA-045] «Archivar tema» lo saca de la lista con un cartel que trae «Deshacer»; «Deshacer» lo devuelve', async () => {
    const { api, user } = openWindow();
    await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(topic('Intervalos de confianza'));
    await user.click(screen.getByRole('button', { name: 'Archivar tema' }));

    expect(await screen.findByText('Tema archivado.')).toBeTruthy();
    expect(topics().queryByRole('button', { name: /^Intervalos de confianza/ })).toBeNull();
    // Con el tema archivado ya no hay un tema elegido: vuelve a «Todas las notas».
    expect(topic('Todas las notas').getAttribute('aria-current')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByText('Listo: deshiciste el cambio.')).toBeTruthy();
    expect(
      await topics().findByRole('button', { name: 'Intervalos de confianza · 0' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull();
  });

  it('[CA-045] los temas archivados se ven en «Archivadas», con «Desarchivar tema»', async () => {
    const { api, user } = openWindow();
    await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(topic('Intervalos de confianza'));
    await user.click(screen.getByRole('button', { name: 'Archivar tema' }));
    await user.click(topic('Archivadas'));

    const archivedTopics = within(await screen.findByRole('list', { name: 'Temas archivados' }));
    expect(archivedTopics.getAllByRole('listitem')).toHaveLength(1);
    expect(archivedTopics.getByText('Intervalos de confianza')).toBeTruthy();
    await user.click(archivedTopics.getByRole('button', { name: 'Desarchivar tema' }));
    expect(
      await topics().findByRole('button', { name: 'Intervalos de confianza · 0' }),
    ).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Temas archivados' })).toBeNull();
  });

  it('«Eliminar tema» lo manda a la Papelera; sus notas siguen ahí, en «Sin tema»', async () => {
    const { api, user } = openWindow();
    await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(topic('Media y dispersión'));
    await user.click(screen.getByRole('button', { name: 'Eliminar tema' }));

    expect(await screen.findByText('El tema está en la Papelera.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeTruthy();
    expect(topics().queryByRole('button', { name: /^Media y dispersión/ })).toBeNull();
    await user.click(topic('Sin tema'));
    expect(await notesList().findByRole('button', { name: 'Media y desvío' })).toBeTruthy();
    expect(
      (await api['trash.listOrganization']({})).items.map((item) => [item.kind, item.name]),
    ).toEqual([['topic', 'Media y dispersión']]);
  });

  it('«Deshacer» en el cartel de «Eliminar tema» devuelve el tema con su nota', async () => {
    const { api, user } = openWindow();
    await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(topic('Media y dispersión'));
    await user.click(screen.getByRole('button', { name: 'Eliminar tema' }));
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }));
    expect(await topics().findByRole('button', { name: 'Media y dispersión · 1' })).toBeTruthy();
    expect((await api['trash.listOrganization']({})).items).toEqual([]);
  });
});

describe('notas', () => {
  it('[CA-040] una nota sin tema aparece en «Sin tema» y «Mover a…» la pasa al tema «Regresión»', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedStatistics(api);
    await seedNote(api, { subjectId: statistics.id, title: 'Regresión lineal' });
    render(<App />);
    await openNotes(user);

    await user.click(screen.getByRole('button', { name: 'Nuevo tema' }));
    await user.type(screen.getByRole('textbox', { name: 'Nombre del tema' }), 'Regresión{Enter}');
    expect(await topics().findByRole('button', { name: 'Regresión · 0' })).toBeTruthy();

    await user.click(topic('Sin tema'));
    expect(notesList().getAllByRole('listitem')).toHaveLength(1);
    await user.click(noteRow('Regresión lineal').getByRole('button', { name: 'Mover a…' }));

    const dialog = await screen.findByRole('dialog', { name: 'Mover a…' });
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Cerrar', 'Media y dispersión', 'Intervalos de confianza', 'Regresión', 'Sin tema']);
    await user.click(within(dialog).getByRole('button', { name: 'Regresión' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Nota movida a «Regresión».')).toBeTruthy();
    expect(await screen.findByText('No hay notas sin tema.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Notas' })).toBeNull();

    await user.click(topic('Regresión'));
    expect(await notesList().findByRole('button', { name: 'Regresión lineal' })).toBeTruthy();
    expect(topic('Regresión').textContent).toBe('Regresión · 1');
    const { notes } = await api['notes.list']({ subjectId: statistics.id });
    expect(notes.find((note) => note.title === 'Regresión lineal')?.topicId).not.toBeNull();
  });

  it('«Mover a…» ofrece «Sin tema» para sacar la nota de su tema, y «Deshacer» la vuelve a su tema', async () => {
    const { api, user } = openWindow();
    const { media, note } = await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(await notesList().findByRole('button', { name: 'Mover a…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mover a…' });
    await user.click(within(dialog).getByRole('button', { name: 'Sin tema' }));

    expect(await screen.findByText('Nota movida a «Sin tema».')).toBeTruthy();
    expect(
      (await api['notes.list']({ subjectId: media.subjectId })).notes.find((n) => n.id === note.id)
        ?.topicId,
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByText('Listo: deshiciste el cambio.')).toBeTruthy();
    await waitFor(async () =>
      expect(
        (await api['notes.list']({ subjectId: media.subjectId })).notes.find(
          (n) => n.id === note.id,
        )?.topicId,
      ).toBe(media.id),
    );
  });

  it('sin temas, «Mover a…» lo dice y deja «Sin tema»', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedSubjects(api);
    await seedNote(api, { subjectId: statistics.id, title: 'Idea suelta' });
    render(<App />);
    await openNotes(user);
    await user.click(await notesList().findByRole('button', { name: 'Mover a…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mover a…' });
    expect(
      within(dialog).getByText('Todavía no creaste temas. Podés dejarla sin tema.'),
    ).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Sin tema' })).toBeTruthy();
  });

  it('arrastrar una nota con el mouse sobre un tema la mueve; sobre «Todas las notas» o «Archivadas» no se puede soltar', async () => {
    const { bridge, api, user } = openWindow();
    const { statistics, intervals } = await seedStatistics(api);
    await seedNote(api, { subjectId: statistics.id, title: 'Nota para arrastrar' });
    render(<App />);
    await openNotes(user);
    await user.click(topic('Sin tema'));
    const item = (await notesList().findByRole('button', { name: 'Nota para arrastrar' })).closest(
      'li',
    ) as HTMLElement;
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(() => ''),
      effectAllowed: '',
      dropEffect: '',
    };

    fireEvent.dragStart(item, { dataTransfer });
    for (const name of ['Todas las notas', 'Archivadas']) {
      fireEvent.dragOver(topic(name), { dataTransfer });
      fireEvent.drop(topic(name), { dataTransfer });
    }
    expect(bridge.sent.filter((message) => message.channel === 'notes.move')).toEqual([]);

    const target = topic('Intervalos de confianza');
    expect(fireEvent.dragOver(target, { dataTransfer })).toBe(false);
    fireEvent.drop(target, { dataTransfer });
    expect(await screen.findByText('Nota movida a «Intervalos de confianza».')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nota para arrastrar' })).toBeNull();
    const { notes } = await api['notes.list']({ subjectId: statistics.id });
    expect(notes.find((note) => note.title === 'Nota para arrastrar')?.topicId).toBe(intervals.id);
  });

  it('[CA-040] «Nueva nota» crea la nota en el tema elegido y la abre con el foco en el título', async () => {
    const { api, user } = openWindow();
    const { statistics, intervals } = await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(topic('Intervalos de confianza'));
    await user.click(screen.getByRole('button', { name: 'Nueva nota' }));

    expect(await screen.findByRole('region', { name: 'Editor de prueba' })).toBeTruthy();
    expect(screen.getByText('foco en el título: true')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Sin título' })).toBeTruthy();
    const { notes } = await api['notes.list']({ subjectId: statistics.id });
    expect(notes.filter((note) => note.topicId === intervals.id)).toHaveLength(1);
  });

  it('[CA-040] «Nueva nota» en «Todas las notas», «Sin tema» o «Archivadas» crea una nota sin tema', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    for (const name of ['Todas las notas', 'Sin tema', 'Archivadas']) {
      await user.click(topic(name));
      await user.click(screen.getByRole('button', { name: 'Nueva nota' }));
      await user.click(await screen.findByRole('button', { name: 'Volver a las notas' }));
      await screen.findByRole('navigation', { name: 'Temas' });
    }
    const { notes } = await api['notes.list']({ subjectId: statistics.id });
    expect(notes.filter((note) => note.topicId === null && note.title === '')).toHaveLength(3);
  });

  it('el título de la nota abre el editor; «Volver a las notas» vuelve a la lista ya actualizada', async () => {
    const { api, user } = openWindow();
    const { note } = await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(await notesList().findByRole('button', { name: 'Media y desvío' }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Media y desvío' })).toBeTruthy();
    expect(screen.getByText('foco en el título: false')).toBeTruthy();
    // Con el editor abierto no se ve la lista ni los temas.
    expect(screen.queryByRole('navigation', { name: 'Temas' })).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();

    // El editor guardó otro título: al guardar, la lista lo refleja sin salir.
    await api['notes.save']({
      noteId: note.id,
      title: 'Media y desvío estándar',
      blocks: note.blocks,
    });
    await user.click(screen.getByRole('button', { name: 'Simular guardado' }));
    await user.click(screen.getByRole('button', { name: 'Volver a las notas' }));
    expect(
      await notesList().findByRole('button', { name: 'Media y desvío estándar' }),
    ).toBeTruthy();
    expect(topics().getByRole('button', { name: 'Media y dispersión · 1' })).toBeTruthy();
  });

  it('un enlace a una nota de otra materia pasa a mirar esa materia y la abre en el renglón pedido', async () => {
    const { api, user } = openWindow();
    const { statistics, history } = await seedStatistics(api);
    const origin = await seedNote(api, { subjectId: statistics.id, title: 'Con enlace' });
    const destination = await seedNote(api, { subjectId: history.id, title: 'Revolución de Mayo' });
    editor.target = { noteId: destination.id, blockId: destination.blocks[0]?.id ?? '' };
    render(<App />);
    await openNotes(user);
    await user.click(await notesList().findByRole('button', { name: 'Con enlace' }));
    expect(origin.id).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Simular enlace' }));

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Revolución de Mayo' }),
    ).toBeTruthy();
    expect(screen.getByText(`renglón: ${editor.target.blockId}`)).toBeTruthy();
    expect(await main().findByText('Estás mirando: Historia argentina')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Volver a las notas' }));
    expect(await notesList().findByRole('button', { name: 'Revolución de Mayo' })).toBeTruthy();
    expect(notesList().queryByRole('button', { name: 'Con enlace' })).toBeNull();
  });

  it('un enlace a una nota que ya no existe avisa «Esa nota ya no existe.» y no cambia de pantalla', async () => {
    const { api, user } = openWindow();
    await seedStatistics(api);
    editor.target = { noteId: crypto.randomUUID(), blockId: crypto.randomUUID() };
    render(<App />);
    await openNotes(user);
    await user.click(await notesList().findByRole('button', { name: 'Media y desvío' }));
    await user.click(await screen.findByRole('button', { name: 'Simular enlace' }));
    expect(await screen.findByText('Esa nota ya no existe.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Media y desvío' })).toBeTruthy();
  });

  it('[CA-045] «Archivar» saca la nota de la lista, la muestra en «Archivadas» y el cartel trae «Deshacer»', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(await notesList().findByRole('button', { name: 'Archivar' }));

    expect(await screen.findByText('Nota archivada.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Media y desvío' })).toBeNull();
    expect(await screen.findByText(/^Todavía no hay notas en esta materia/)).toBeTruthy();
    expect(topics().getByRole('button', { name: 'Media y dispersión · 0' })).toBeTruthy();

    await user.click(topic('Archivadas'));
    const archived = notesList('Notas archivadas');
    expect(archived.getByRole('button', { name: 'Media y desvío' })).toBeTruthy();
    const { notes } = await api['notes.list']({ subjectId: statistics.id });
    expect(notes.find((note) => note.title === 'Media y desvío')?.archived).toBe(true);
  });

  it('[CA-045] «Deshacer» en el cartel devuelve la nota archivada a la lista', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(await notesList().findByRole('button', { name: 'Archivar' }));
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }));

    expect(await screen.findByText('Listo: deshiciste el cambio.')).toBeTruthy();
    expect(await notesList().findByRole('button', { name: 'Media y desvío' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull();
    const { notes } = await api['notes.list']({ subjectId: statistics.id });
    expect(notes.find((note) => note.title === 'Media y desvío')?.archived).toBe(false);
  });

  it('[CA-045] en «Archivadas», «Desarchivar» la devuelve y el cartel también trae «Deshacer»', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(await notesList().findByRole('button', { name: 'Archivar' }));
    await user.click(topic('Archivadas'));
    await user.click(
      noteRow('Media y desvío', 'Notas archivadas').getByRole('button', { name: 'Desarchivar' }),
    );

    expect(await screen.findByText('Nota desarchivada.')).toBeTruthy();
    expect(await screen.findByText('No archivaste nada.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(async () =>
      expect(
        (await api['notes.list']({ subjectId: statistics.id })).notes.find(
          (n) => n.title === 'Media y desvío',
        )?.archived,
      ).toBe(true),
    );
  });

  it('«Eliminar» manda la nota a la Papelera con un cartel que trae «Deshacer»', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedStatistics(api);
    render(<App />);
    await openNotes(user);
    await user.click(await notesList().findByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText('La nota está en la Papelera.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Media y desvío' })).toBeNull();
    expect((await api['notes.list']({ subjectId: statistics.id })).notes).toEqual([]);
    expect((await api['trash.listOrganization']({})).items.map((item) => item.name)).toEqual([
      'Media y desvío',
    ]);
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(await notesList().findByRole('button', { name: 'Media y desvío' })).toBeTruthy();
    expect((await api['trash.listOrganization']({})).items).toEqual([]);
  });

  it('un cartel por vez: se va al hacer otra cosa', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedStatistics(api);
    await seedNote(api, { subjectId: statistics.id, title: 'Otra nota' });
    render(<App />);
    await openNotes(user);
    await user.click(noteRow('Otra nota').getByRole('button', { name: 'Archivar' }));
    expect(await screen.findByText('Nota archivada.')).toBeTruthy();

    await user.click(noteRow('Media y desvío').getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('La nota está en la Papelera.')).toBeTruthy();
    expect(screen.queryByText('Nota archivada.')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Deshacer' })).toHaveLength(1);

    await user.click(topic('Sin tema'));
    expect(screen.queryByText('La nota está en la Papelera.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull();
  });

  it('si no se puede completar una acción, avisa sin jerga y no cambia nada', async () => {
    const { bridge, api, user } = openWindow();
    const { statistics } = await seedStatistics(api);
    bridge.handlers['notes.archive'] = async () => {
      throw new Error('base bloqueada');
    };
    render(<App />);
    await openNotes(user);
    await user.click(await notesList().findByRole('button', { name: 'Archivar' }));
    expect(await screen.findByText('No pude completar esto. Probá de nuevo.')).toBeTruthy();
    expect(screen.queryByText(/base bloqueada/)).toBeNull();
    expect(notesList().getByRole('button', { name: 'Media y desvío' })).toBeTruthy();
    expect((await api['notes.list']({ subjectId: statistics.id })).notes[0]?.archived).toBe(false);
  });
});

describe('los estados de la lista', () => {
  it('cada selección vacía dice su frase', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedSubjects(api);
    await api['topics.create']({ subjectId: statistics.id, name: 'Regresión' });
    render(<App />);
    await openNotes(user);
    expect(
      await screen.findByText(
        'Todavía no hay notas en esta materia. Tocá «Nueva nota» para escribir la primera.',
      ),
    ).toBeTruthy();
    await user.click(topic('Regresión'));
    expect(screen.getByText('Este tema todavía no tiene notas.')).toBeTruthy();
    await user.click(topic('Sin tema'));
    expect(screen.getByText('No hay notas sin tema.')).toBeTruthy();
    await user.click(topic('Archivadas'));
    expect(screen.getByText('No archivaste nada.')).toBeTruthy();
  });

  it('si no se pueden leer las notas, lo dice y «Reintentar» las vuelve a pedir', async () => {
    const { bridge, api, user } = openWindow();
    await seedStatistics(api);
    const original = bridge.handlers['notes.list'];
    bridge.handlers['notes.list'] = async () => {
      throw new Error('base bloqueada');
    };
    render(<App />);
    await user.click(within(rail()).getByRole('button', { name: 'Apuntes' }));
    expect(await screen.findByText('No pude cargar tus notas. Probá de nuevo.')).toBeTruthy();
    expect(screen.queryByText(/base bloqueada/)).toBeNull();
    bridge.handlers['notes.list'] = original;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await notesList().findByRole('button', { name: 'Media y desvío' })).toBeTruthy();
  });
});

describe('las secciones de Apuntes que ya existían', () => {
  it('«Tarjetas» sigue siendo la pantalla provisoria de la Fase 03', async () => {
    const { api, user } = openWindow();
    await seedStatistics(api);
    await api['cards.create']({ question: '¿Capital de Francia?', answer: 'París' });
    render(<App />);
    await openNotes(user);
    await user.click(
      within(screen.getByRole('navigation', { name: 'Secciones de Apuntes' })).getByRole('button', {
        name: 'Tarjetas',
      }),
    );
    expect(await screen.findByText('¿Capital de Francia?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nueva tarjeta' })).toBeTruthy();
  });
});
