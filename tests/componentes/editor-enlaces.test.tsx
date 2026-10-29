import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOSAVE_MS } from '../../src/preload/contract/notes';
import {
  contentEditor,
  contentElement,
  deferred,
  installApi,
  note,
  outline,
  pressKey,
  putCursorAtEnd,
  renderNote,
  row,
  rowId,
  typeText,
  uuid,
} from './editor-apoyo';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const INTERVALOS = uuid(500);
const MEDIA = uuid(501);

function titles(...entries: { id: string; title: string; topicName: string | null }[]) {
  return { notes: entries };
}

const intervalos = {
  id: INTERVALOS,
  title: 'Intervalos de confianza',
  topicName: 'Intervalos de confianza',
};
const media = { id: MEDIA, title: 'Media y desvío', topicName: null };

const mentionNodes = () => {
  const found: Record<string, unknown>[] = [];
  contentEditor().state.doc.descendants((node) => {
    if (node.type.name === 'mention') {
      found.push(node.attrs);
    }
  });
  return found;
};

function writeAfterLinks(text: string) {
  const editor = contentEditor();
  putCursorAtEnd(editor, rowId(1));
  typeText(editor, text);
}

describe('[CA-374] «[[» y las primeras letras ofrecen las notas para enlazar', () => {
  beforeEach(() => {
    installApi();
  });

  it('[CA-374] «[[» con letras muestra las notas que devuelve el puente, con el tema para distinguirlas', async () => {
    const api = installApi();
    api.titles.mockResolvedValue(titles(intervalos, media));
    renderNote(note('Enlaces', [row(1, 'Ver ')]));
    writeAfterLinks('[[Inter');

    const list = await screen.findByRole('listbox', { name: 'Notas para enlazar' });
    const options = within(list).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Intervalos de confianza · Intervalos de confianza',
      'Media y desvío',
    ]);
    expect(api.titles).toHaveBeenLastCalledWith({ query: 'Inter' });
  });

  it('[CA-374] el foco se queda en el editor y la opción elegida se señala con aria-activedescendant', async () => {
    const api = installApi();
    api.titles.mockResolvedValue(titles(intervalos, media));
    renderNote(note('Enlaces', [row(1, 'Ver ')]));
    writeAfterLinks('[[');
    const list = await screen.findByRole('listbox', { name: 'Notas para enlazar' });
    const options = within(list).getAllByRole('option');
    const editorElement = contentElement();

    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    expect(options[1]?.getAttribute('aria-selected')).toBe('false');
    expect(editorElement.getAttribute('aria-activedescendant')).toBe(options[0]?.id);
    expect(options[0]?.id).not.toBe('');

    expect(pressKey(contentEditor(), 'ArrowDown').defaultPrevented).toBe(true);
    expect(options[1]?.getAttribute('aria-selected')).toBe('true');
    expect(editorElement.getAttribute('aria-activedescendant')).toBe(options[1]?.id);
    pressKey(contentEditor(), 'ArrowUp');
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    pressKey(contentEditor(), 'ArrowUp');
    expect(options[1]?.getAttribute('aria-selected')).toBe('true');
  });

  it('[CA-374] Enter elige la nota: reemplaza lo escrito por el enlace con su identificador y su nombre', async () => {
    const api = installApi();
    api.titles.mockResolvedValue(titles(intervalos, media));
    renderNote(note('Enlaces', [row(1, 'Ver ')]));
    writeAfterLinks('[[Inter');
    await screen.findByRole('listbox', { name: 'Notas para enlazar' });

    const event = pressKey(contentEditor(), 'Enter');
    expect(event.defaultPrevented).toBe(true);
    expect(mentionNodes()).toEqual([{ id: INTERVALOS, label: 'Intervalos de confianza' }]);
    expect(contentEditor().state.doc.textContent).toBe('Ver ');
    expect(outline(contentEditor())).toBe('Ver ');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(
      within(contentElement()).getByRole('link', { name: 'Abrir Intervalos de confianza' }),
    ).toBeTruthy();
  });

  it('[CA-374] con ↓ y Enter se elige la segunda; un clic en una opción también elige', async () => {
    const api = installApi();
    api.titles.mockResolvedValue(titles(intervalos, media));
    renderNote(note('Enlaces', [row(1, 'Ver ')]));
    writeAfterLinks('[[');
    await screen.findByRole('listbox', { name: 'Notas para enlazar' });
    pressKey(contentEditor(), 'ArrowDown');
    pressKey(contentEditor(), 'Enter');
    expect(mentionNodes()).toEqual([{ id: MEDIA, label: 'Media y desvío' }]);

    writeAfterLinks(' y [[Inter');
    const option = await screen.findByRole('option', { name: /Intervalos de confianza/ });
    fireEvent.mouseDown(option);
    fireEvent.click(option);
    expect(mentionNodes().map((attrs) => attrs.id)).toEqual([MEDIA, INTERVALOS]);
  });

  it('[CA-374] Esc cierra la lista y deja lo escrito como está', async () => {
    const api = installApi();
    api.titles.mockResolvedValue(titles(intervalos));
    renderNote(note('Enlaces', [row(1, 'Ver ')]));
    writeAfterLinks('[[Inter');
    await screen.findByRole('listbox', { name: 'Notas para enlazar' });

    expect(pressKey(contentEditor(), 'Escape').defaultPrevented).toBe(true);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(contentEditor().state.doc.textContent).toBe('Ver [[Inter');
    expect(mentionNodes()).toEqual([]);
  });

  it('[CA-374] sin coincidencias dice «No encontré notas con ese nombre.»', async () => {
    const api = installApi();
    api.titles.mockResolvedValue(titles());
    renderNote(note('Enlaces', [row(1, 'Ver ')]));
    writeAfterLinks('[[zzzz');

    expect(await screen.findByText('No encontré notas con ese nombre.')).toBeTruthy();
    expect(screen.queryByRole('option')).toBeNull();
    // Enter sin opciones sigue siendo un Enter común: parte el renglón.
    pressKey(contentEditor(), 'Enter');
    expect(outline(contentEditor())).toBe('Ver [[zzzz,');
  });

  it('[CA-374] al seguir escribiendo se vuelve a buscar con lo nuevo, y una respuesta vieja no pisa a la nueva', async () => {
    const api = installApi();
    const slow = deferred<ReturnType<typeof titles>>();
    api.titles.mockReturnValueOnce(slow.promise).mockResolvedValue(titles(media));
    renderNote(note('Enlaces', [row(1, 'Ver ')]));
    writeAfterLinks('[[In');
    typeText(contentEditor(), 'x');
    expect(await screen.findByRole('option', { name: 'Media y desvío' })).toBeTruthy();
    expect(api.titles).toHaveBeenLastCalledWith({ query: 'Inx' });

    await act(async () => {
      slow.resolve(titles(intervalos));
    });
    expect(screen.queryByRole('option', { name: /Intervalos de confianza/ })).toBeNull();
    expect(screen.getByRole('option', { name: 'Media y desvío' })).toBeTruthy();
  });

  it('[CA-374] un solo corchete o un enlace ya cerrado no abren la lista', () => {
    const api = installApi();
    renderNote(note('Enlaces', [row(1, 'Ver ')]));
    writeAfterLinks('[Inter');
    expect(api.titles).not.toHaveBeenCalled();
    typeText(contentEditor(), ' [[Cerrado]] y más');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(api.titles).not.toHaveBeenCalled();
  });

  it('[CA-374] si el puente falla al buscar, la lista no se abre ni rompe el editor', async () => {
    const api = installApi();
    api.titles.mockRejectedValue(new Error('sin base'));
    renderNote(note('Enlaces', [row(1, 'Ver ')]));
    writeAfterLinks('[[Inter');
    await waitFor(() => expect(api.titles).toHaveBeenCalled());
    expect(screen.queryByRole('listbox')).toBeNull();
    typeText(contentEditor(), 'x');
    expect(contentEditor().state.doc.textContent).toBe('Ver [[Interx');
  });
});

describe('[CA-374] el enlace dibujado en el renglón', () => {
  beforeEach(() => {
    installApi();
  });

  const withLink = (label = 'Media y desvío') =>
    note('Con enlace', [
      row(1, '', {
        content: [
          { type: 'text', text: 'Ver ' },
          { type: 'mention', id: MEDIA, label },
          { type: 'text', text: ' también.' },
        ],
      }),
    ]);

  it('[CA-374] se ve como un enlace con nombre «Abrir …» y un clic abre esa nota por su identificador', async () => {
    const { onOpenNote } = renderNote(withLink());
    const link = within(contentElement()).getByRole('link', { name: 'Abrir Media y desvío' });
    expect(link.textContent).toContain('Media y desvío');
    await userEvent.setup().click(link);
    expect(onOpenNote).toHaveBeenCalledTimes(1);
    expect(onOpenNote).toHaveBeenCalledWith(MEDIA);
  });

  it('[CA-374] se alcanza con el teclado y Enter lo abre', async () => {
    const { onOpenNote } = renderNote(withLink());
    const user = userEvent.setup();
    const link = within(contentElement()).getByRole('link', { name: 'Abrir Media y desvío' });
    link.focus();
    expect(document.activeElement).toBe(link);
    await user.keyboard('{Enter}');
    expect(onOpenNote).toHaveBeenCalledWith(MEDIA);
    // El Enter del enlace no parte el renglón.
    expect(within(contentElement()).getAllByRole('listitem')).toHaveLength(1);
  });

  it('[CA-374] el clic en el enlace no deja un cambio para guardar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const api = installApi();
    const { onOpenNote } = renderNote(withLink());
    fireEvent.click(within(contentElement()).getByRole('link', { name: 'Abrir Media y desvío' }));
    expect(onOpenNote).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);
    });
    expect(api.save).not.toHaveBeenCalled();
  });

  it('[CA-374] un enlace sin nombre se ve como «Sin título»', () => {
    renderNote(withLink(''));
    expect(within(contentElement()).getByRole('link', { name: 'Abrir Sin título' })).toBeTruthy();
  });
});

describe('[CA-376] renombrar una nota enlazada no rompe los enlaces', () => {
  beforeEach(() => {
    installApi();
  });

  it('[CA-376] el enlace muestra el nombre nuevo que trae la nota y sigue apuntando a la misma por su identificador', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const api = installApi();
    const { onOpenNote } = renderNote(
      note('Origen', [
        row(1, '', {
          content: [
            { type: 'text', text: 'Ver ' },
            { type: 'mention', id: INTERVALOS, label: 'Estimación por intervalos' },
          ],
        }),
        row(2, 'Otro'),
      ]),
    );
    const link = within(contentElement()).getByRole('link', {
      name: 'Abrir Estimación por intervalos',
    });
    expect(
      within(contentElement()).queryByRole('link', { name: /Abrir Intervalos de confianza/ }),
    ).toBeNull();
    fireEvent.click(link);
    expect(onOpenNote).toHaveBeenCalledWith(INTERVALOS);

    putCursorAtEnd(contentEditor(), rowId(2));
    typeText(contentEditor(), ' más');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });
    const saved = api.save.mock.calls[0]?.[0].blocks[0]?.content;
    expect(saved?.[1]).toEqual({
      type: 'mention',
      id: INTERVALOS,
      label: 'Estimación por intervalos',
    });
  });
});

describe('[CA-375] «Mencionada en»', () => {
  beforeEach(() => {
    installApi();
  });

  const mentionedBy = [
    {
      noteId: uuid(600),
      noteTitle: 'Media y desvío',
      blockId: uuid(610),
      excerpt: 'Para ver cómo se usa en un intervalo',
    },
    {
      noteId: uuid(601),
      noteTitle: '',
      blockId: uuid(611),
      excerpt: 'Un renglón de una nota sin título',
    },
  ];

  it('[CA-375] el botón abre la sección con un renglón por mención: nombre de la nota de origen y extracto', async () => {
    const api = installApi();
    api.mentions.mockResolvedValue({ mentions: mentionedBy });
    renderNote(note('Intervalos de confianza', [row(1, 'Texto')]));
    const toggle = screen.getByRole('button', { name: 'Mencionada en' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(api.mentions).not.toHaveBeenCalled();

    fireEvent.click(toggle);
    const list = await screen.findByRole('list', { name: 'Renglones que la mencionan' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(api.mentions).toHaveBeenCalledWith({ noteId: expect.any(String) });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('Media y desvío');
    expect(items[0]?.textContent).toContain('Para ver cómo se usa en un intervalo');
    expect(items[1]?.textContent).toContain('Sin título');
    expect(items[1]?.textContent).toContain('Un renglón de una nota sin título');
  });

  it('[CA-375] un clic en la mención lleva a ese renglón de esa nota', async () => {
    const api = installApi();
    api.mentions.mockResolvedValue({ mentions: mentionedBy });
    const { onOpenNote } = renderNote(note('Intervalos de confianza', [row(1, 'Texto')]));
    fireEvent.click(screen.getByRole('button', { name: 'Mencionada en' }));
    const list = await screen.findByRole('list', { name: 'Renglones que la mencionan' });
    fireEvent.click(within(list).getByRole('button', { name: 'Abrir Media y desvío' }));
    expect(onOpenNote).toHaveBeenCalledTimes(1);
    expect(onOpenNote).toHaveBeenCalledWith(uuid(600), uuid(610));
  });

  it('[CA-375] pide las menciones de la nota abierta y no antes de abrir la sección', async () => {
    const api = installApi();
    renderNote(note('Intervalos de confianza', [row(1, 'Texto')]));
    fireEvent.click(screen.getByRole('button', { name: 'Mencionada en' }));
    await waitFor(() => expect(api.mentions).toHaveBeenCalledTimes(1));
    expect(api.mentions.mock.calls[0]?.[0]).toEqual({ noteId: uuid(1) });
  });

  it('[CA-375] sin menciones dice que ninguna nota la menciona todavía', async () => {
    renderNote(note('Sola', [row(1, 'Texto')]));
    fireEvent.click(screen.getByRole('button', { name: 'Mencionada en' }));
    expect(await screen.findByText('Ninguna nota la menciona todavía.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Renglones que la mencionan' })).toBeNull();
  });

  it('[CA-375] si falla dice «No pude cargar las menciones. Probá de nuevo.»', async () => {
    const api = installApi();
    api.mentions.mockRejectedValue(new Error('sin base'));
    renderNote(note('Falla', [row(1, 'Texto')]));
    fireEvent.click(screen.getByRole('button', { name: 'Mencionada en' }));
    expect(await screen.findByText('No pude cargar las menciones. Probá de nuevo.')).toBeTruthy();
  });

  it('[CA-375] el mismo botón cierra la sección', async () => {
    const api = installApi();
    api.mentions.mockResolvedValue({ mentions: mentionedBy });
    renderNote(note('Intervalos de confianza', [row(1, 'Texto')]));
    const toggle = screen.getByRole('button', { name: 'Mencionada en' });
    fireEvent.click(toggle);
    await screen.findByRole('list', { name: 'Renglones que la mencionan' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list', { name: 'Renglones que la mencionan' })).toBeNull();
  });
});
