import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rowCardKind } from '../../src/core/cards';
import { AUTOSAVE_MS, type InlineNode } from '../../src/preload/contract/notes';
import { rowCardOf } from '../../src/renderer/notes/editor/card-marker';
import {
  contentEditor,
  contentElement,
  installApi,
  note,
  putCursor,
  renderNote,
  row,
  rowId,
  run,
  typeText,
  uuid,
} from './editor-apoyo';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const CTRL_SHIFT_C = { ctrlKey: true, shiftKey: true };

// Una tecla con modificadores en el editor: el mismo camino que sigue el teclado.
function press(key: string, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  run(() => {
    contentEditor().view.dom.dispatchEvent(event);
  });
  return event;
}

// Elige un tramo de texto de un renglón por lo que dice.
function selectText(blockId: string, text: string) {
  const editor = contentEditor();
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'listItem' && node.attrs.blockId === blockId) {
      const paragraph = node.child(0);
      const at = paragraph.textContent.indexOf(text);
      if (at !== -1) {
        found = pos + 2 + at;
      }
    }
    return found === -1;
  });
  if (found === -1) {
    throw new Error(`no encontré «${text}»`);
  }
  run(() => {
    editor.commands.setTextSelection({ from: found, to: found + text.length });
  });
}

const holes = () => [...contentElement().querySelectorAll('mark[data-cloze]')];

describe('[CA-049] Ctrl+Mayús+C convierte la selección en un hueco', () => {
  beforeEach(() => {
    installApi();
  });

  it('[CA-049] «100 °C» queda resaltado como hueco', async () => {
    await renderNote(note('Agua', [row(1, 'El agua hierve a 100 °C al nivel del mar')]));
    selectText(rowId(1), '100 °C');
    const event = press('C', CTRL_SHIFT_C);
    expect(event.defaultPrevented).toBe(true);
    expect(holes().map((hole) => hole.textContent)).toEqual(['100 °C']);
    expect(holes()[0]?.getAttribute('data-cloze')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('[CA-049] el renglón queda marcado como tarjeta de completar', async () => {
    await renderNote(note('Agua', [row(1, 'El agua hierve a 100 °C al nivel del mar')]));
    expect(contentElement().querySelector('li[data-card]:not([data-card="none"])')).toBeNull();
    selectText(rowId(1), '100 °C');
    press('C', CTRL_SHIFT_C);
    await act(async () => {});
    const marked = contentElement().querySelector('li[data-card="cloze"]');
    expect(marked).not.toBeNull();
    expect(
      within(marked as HTMLElement).getByRole('img', {
        name: 'Este renglón es una tarjeta de completar',
      }).textContent,
    ).toBe('Tarjeta');
  });

  it('[CA-049] el guardado manda el hueco con su identificador y el texto que oculta', async () => {
    vi.useFakeTimers();
    const api = installApi();
    await renderNote(note('Agua', [row(1, 'El agua hierve a 100 °C al nivel del mar')]));
    selectText(rowId(1), '100 °C');
    press('C', CTRL_SHIFT_C);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });
    const sent = api.save.mock.calls[0]?.[0].blocks[0]?.content as InlineNode[];
    expect(sent.map((node) => node.type)).toEqual(['text', 'cloze', 'text']);
    expect(sent[1]).toMatchObject({ type: 'cloze', text: '100 °C' });
    expect(sent[0]).toMatchObject({ text: 'El agua hierve a ' });
    expect(sent[2]).toMatchObject({ text: ' al nivel del mar' });
  });

  it('apretar el atajo otra vez sobre el hueco lo saca', async () => {
    await renderNote(note('Agua', [row(1, 'El agua hierve a 100 °C al nivel del mar')]));
    selectText(rowId(1), '100 °C');
    press('C', CTRL_SHIFT_C);
    selectText(rowId(1), '100 °C');
    press('C', CTRL_SHIFT_C);
    await act(async () => {});
    expect(holes()).toEqual([]);
    expect(contentElement().querySelector('li[data-card]:not([data-card="none"])')).toBeNull();
  });

  it('sin texto elegido el atajo no hace nada (y no abre otra cosa)', async () => {
    await renderNote(note('Agua', [row(1, 'El agua hierve')]));
    putCursor(contentEditor(), rowId(1), 3);
    const event = press('C', CTRL_SHIFT_C);
    expect(event.defaultPrevented).toBe(true);
    expect(holes()).toEqual([]);
  });

  it('[CA-050] dos huecos en el mismo renglón tienen identificadores distintos y el renglón dice «2 tarjetas»', async () => {
    await renderNote(note('Medias', [row(1, 'La media es 4 y la mediana es 5')]));
    selectText(rowId(1), '4');
    press('C', CTRL_SHIFT_C);
    selectText(rowId(1), '5');
    press('C', CTRL_SHIFT_C);
    await act(async () => {});
    const ids = holes().map((hole) => hole.getAttribute('data-cloze'));
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(
      within(contentElement().querySelector('li[data-card="cloze"]') as HTMLElement).getByRole(
        'img',
      ).textContent,
    ).toBe('2 tarjetas');
  });

  it('un hueco partido con Enter no deja dos huecos con el mismo identificador en un renglón', async () => {
    await renderNote(note('Partir', [row(1, 'antes AABB después')]));
    selectText(rowId(1), 'AABB');
    press('C', CTRL_SHIFT_C);
    putCursor(contentEditor(), rowId(1), 'antes AA'.length);
    run(() => {
      contentEditor().commands.splitBlock();
    });
    const byRow = new Map<string, string[]>();
    contentEditor().state.doc.descendants((node) => {
      if (node.type.name === 'paragraph') {
        const ids: string[] = [];
        node.forEach((child) => {
          const mark = child.marks.find((item) => item.type.name === 'cloze');
          if (mark) {
            ids.push(String(mark.attrs.id));
          }
        });
        byRow.set(node.textContent, ids);
      }
    });
    for (const ids of byRow.values()) {
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('[CA-049] escribir «{{texto}}» también crea el hueco', () => {
  beforeEach(() => {
    installApi();
  });

  // Escribe el último carácter como lo hace el teclado, para que corran las reglas de escritura.
  function typeLast(char: string) {
    const editor = contentEditor();
    const { from, to } = editor.state.selection;
    run(() => {
      const handled = editor.view.someProp('handleTextInput', (handler) =>
        handler(editor.view, from, to, char, () => editor.state.tr.insertText(char, from, to)),
      );
      if (!handled) {
        editor.view.dispatch(editor.state.tr.insertText(char, from, to));
      }
    });
  }

  it('[CA-049] «{{50 %}}» se vuelve un hueco con el texto «50 %» y sin las llaves', async () => {
    await renderNote(note('Mediana', [row(1, '')]));
    putCursor(contentEditor(), rowId(1));
    typeText(contentEditor(), 'La mediana deja el {{50 %}');
    typeLast('}');
    expect(holes().map((hole) => hole.textContent)).toEqual(['50 %']);
    expect(contentEditor().state.doc.textContent).toBe('La mediana deja el 50 %');
  });

  it('un hueco vacío «{{}}» se queda como texto', async () => {
    await renderNote(note('Vacío', [row(1, '')]));
    putCursor(contentEditor(), rowId(1));
    typeText(contentEditor(), 'x {{}');
    typeLast('}');
    expect(holes()).toEqual([]);
    expect(contentEditor().state.doc.textContent).toBe('x {{}}');
  });
});

describe('[CA-048] el renglón con «>>» se marca como tarjeta', () => {
  beforeEach(() => {
    installApi();
  });

  it('[CA-048] «Pendiente >> Cuánto cambia y por cada unidad de x» lleva la marca de tarjeta', async () => {
    await renderNote(
      note('Regresión lineal', [
        row(1, 'Pendiente >> Cuánto cambia y por cada unidad de x'),
        row(2, 'Un renglón común'),
      ]),
    );
    const marked = contentElement().querySelectorAll('li[data-card]:not([data-card="none"])');
    expect(marked).toHaveLength(1);
    expect(marked[0]?.getAttribute('data-card')).toBe('qa');
    expect(
      within(marked[0] as HTMLElement).getByRole('img', {
        name: 'Este renglón es una tarjeta de pregunta y respuesta',
      }).textContent,
    ).toBe('Tarjeta');
  });

  it('[CA-048] al escribir la flecha el renglón se marca y al borrarla se desmarca', async () => {
    await renderNote(note('Regresión lineal', [row(1, 'Pendiente')]));
    expect(contentElement().querySelector('li[data-card]:not([data-card="none"])')).toBeNull();
    putCursor(contentEditor(), rowId(1), 'Pendiente'.length);
    typeText(contentEditor(), ' >> otra cosa');
    expect(contentElement().querySelector('li[data-card="qa"]')).not.toBeNull();
    run(() => {
      contentEditor().commands.setContent(contentEditor().getJSON());
    });
  });

  it('con la flecha sin respuesta, o al revés, no se marca', async () => {
    await renderNote(
      note('Casos', [row(1, 'Pendiente >>'), row(2, '>> respuesta'), row(3, 'x >> y')]),
    );
    expect(contentElement().querySelectorAll('li[data-card]:not([data-card="none"])')).toHaveLength(
      1,
    );
  });
});

describe('la ventana decide qué renglones son tarjeta igual que el guardado', () => {
  const text = (value: string): InlineNode => ({ type: 'text', text: value });
  const cloze = (value: string): InlineNode => ({ type: 'cloze', id: uuid(9), text: value });
  const image: InlineNode = { type: 'image', sha: 'a'.repeat(64), width: 1, height: 1, alt: '' };
  const cases: InlineNode[][] = [
    [],
    [text('nada')],
    [text('a >> b')],
    [text('a >> b >> c')],
    [text('>> b')],
    [text('a >>')],
    [text('  >>  ')],
    [text('a'), cloze('b')],
    [cloze('  ')],
    [cloze('b'), text(' >> c')],
    [image, text(' >> algo')],
    [text('algo >> '), image],
    [text('>>'), image],
    [{ type: 'mention', id: uuid(5), label: 'Otra nota' }, text(' >> definición')],
  ];

  it.for(cases.map((content, index) => [index, content] as const))(
    'caso %i: la marca de la ventana coincide con la regla del núcleo',
    ([, content]) => {
      expect(rowCardOf(content)?.kind ?? null).toBe(rowCardKind(content));
    },
  );
});

describe('[CA-052] el guardado avisa de las tarjetas que perdieron su renglón', () => {
  const lost = { cardId: uuid(40), question: 'Pendiente' };

  function windowWith(
    result: unknown,
    extra: Record<string, unknown> = {},
  ): ReturnType<typeof installApi> {
    const api = installApi();
    api.save.mockResolvedValue(result as never);
    Object.assign(window.retenia, extra);
    return api;
  }

  async function saveOnce() {
    vi.useFakeTimers();
    await renderNote(note('Regresión lineal', [row(1, 'Pendiente >> algo'), row(2, '')]));
    putCursor(contentEditor(), rowId(2));
    typeText(contentEditor(), 'x');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });
  }

  it('[CA-052] pregunta «Este renglón tiene una tarjeta con historial. ¿Qué hacemos?» con las dos opciones', async () => {
    windowWith({ lostCards: [lost], editedCards: [] });
    await saveOnce();
    const dialog = screen.getByRole('dialog', {
      name: 'Este renglón tiene una tarjeta con historial. ¿Qué hacemos?',
    });
    expect(within(dialog).getByText('Tarjeta: Pendiente')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Conservar la tarjeta' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Eliminar la tarjeta' })).toBeTruthy();
  });

  it('[CA-052] «Conservar la tarjeta» cierra la pregunta y no elimina nada', async () => {
    const remove = vi.fn(async () => ({ trashEntryId: uuid(41) }));
    windowWith({ lostCards: [lost], editedCards: [] }, { 'cards.delete': remove });
    await saveOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Conservar la tarjeta' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByText('La tarjeta quedó en Tarjetas, sin nota.')).toBeTruthy();
  });

  it('[CA-052] «Eliminar la tarjeta» la manda a la Papelera', async () => {
    const remove = vi.fn(async (_request: { cardId: string }) => ({ trashEntryId: uuid(41) }));
    windowWith({ lostCards: [lost], editedCards: [] }, { 'cards.delete': remove });
    await saveOnce();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Eliminar la tarjeta' }));
    });
    expect(remove).toHaveBeenCalledWith({ cardId: lost.cardId });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('La tarjeta está en la Papelera.')).toBeTruthy();
  });

  it('[CA-052] Esc es conservar: nada se pierde sin que lo pidas', async () => {
    const remove = vi.fn(async () => ({ trashEntryId: uuid(41) }));
    windowWith({ lostCards: [lost], editedCards: [] }, { 'cards.delete': remove });
    await saveOnce();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });

  it('con dos tarjetas perdidas pregunta una por una, con el mismo texto', async () => {
    windowWith({
      lostCards: [lost, { cardId: uuid(42), question: 'Otra' }],
      editedCards: [],
    });
    await saveOnce();
    expect(screen.getByText('Tarjeta: Pendiente')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Conservar la tarjeta' }));
    expect(screen.getByText('Tarjeta: Otra')).toBeTruthy();
    expect(
      screen.getByRole('dialog', {
        name: 'Este renglón tiene una tarjeta con historial. ¿Qué hacemos?',
      }),
    ).toBeTruthy();
  });

  it('[CA-054] una tarjeta de la nota con historial que cambió pregunta «¿Cambió lo que hay que recordar?»', async () => {
    const mark = vi.fn(async (_request: { cardId: string }) => ({}));
    windowWith(
      { lostCards: [], editedCards: [{ cardId: uuid(43), question: 'Pendiente' }] },
      { 'cards.markMeaningChanged': mark },
    );
    await saveOnce();
    expect(screen.getByText(/¿Cambió lo que hay que recordar\?/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sí' }));
    });
    expect(mark).toHaveBeenCalledWith({ cardId: uuid(43) });
    expect(screen.queryByText(/¿Cambió lo que hay que recordar\?/)).toBeNull();
  });

  it('[CA-054] «No, solo la redacción» no programa nada de nuevo', async () => {
    const mark = vi.fn(async () => ({}));
    windowWith(
      { lostCards: [], editedCards: [{ cardId: uuid(43), question: 'Pendiente' }] },
      { 'cards.markMeaningChanged': mark },
    );
    await saveOnce();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'No, solo la redacción' }));
    });
    expect(mark).not.toHaveBeenCalled();
    expect(screen.queryByText(/¿Cambió lo que hay que recordar\?/)).toBeNull();
  });
});
