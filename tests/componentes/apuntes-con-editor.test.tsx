import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/App';
import { closeWindows, openWindow, seedNote, seedSubjects } from './apoyo-ventana';

// Apuntes con el editor de verdad (el del frente del editor) adentro de la pantalla: abrir una
// nota, crear una y volver a la lista. El resto de las pruebas de Apuntes usan un doble del editor.

afterEach(closeWindows);

const rail = () => screen.getByRole('navigation', { name: 'Riel lateral' });

async function openNotes(user: ReturnType<typeof openWindow>['user']) {
  await user.click(within(rail()).getByRole('button', { name: 'Apuntes' }));
  await screen.findByRole('heading', { level: 3, name: 'Notas' });
}

describe('Apuntes con el editor de notas', () => {
  it('el título de una nota la abre con su título y su texto', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedSubjects(api);
    const note = await seedNote(api, { subjectId: statistics.id, title: 'Media y desvío' });
    await api['notes.save']({
      noteId: note.id,
      title: 'Media y desvío',
      blocks: [
        {
          id: note.blocks[0]?.id ?? '',
          parentId: null,
          collapsed: false,
          content: [{ type: 'text', text: 'La media es el promedio de los datos.' }],
        },
      ],
    });
    render(<App />);
    await openNotes(user);
    await user.click(await screen.findByRole('button', { name: 'Media y desvío' }));

    expect(await screen.findByRole('heading', { level: 3, name: 'Media y desvío' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Título' }) as HTMLInputElement).value).toBe(
      'Media y desvío',
    );
    expect(
      (await screen.findByRole('textbox', { name: 'Contenido de la nota' })).textContent,
    ).toContain('La media es el promedio de los datos.');
  });

  it('[CA-040] «Nueva nota» abre el editor con el foco en el título; escribirlo y «Volver a las notas» deja la nota en la lista', async () => {
    const { api, user } = openWindow();
    const { statistics } = await seedSubjects(api);
    render(<App />);
    await openNotes(user);
    await user.click(screen.getByRole('button', { name: 'Nueva nota' }));

    const title = await screen.findByRole('textbox', { name: 'Título' });
    await waitFor(() => expect(document.activeElement).toBe(title));
    await user.type(title, 'Regresión lineal');
    await user.click(screen.getByRole('button', { name: 'Volver a las notas' }));

    expect(await screen.findByRole('button', { name: 'Regresión lineal' })).toBeTruthy();
    const { notes } = await api['notes.list']({ subjectId: statistics.id });
    expect(notes.map((note) => note.title)).toEqual(['Regresión lineal']);
  });
});
