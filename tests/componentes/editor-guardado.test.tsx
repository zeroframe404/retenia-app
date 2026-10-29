import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOSAVE_MS, type Block } from '../../src/preload/contract/notes';
import {
  contentEditor,
  deferred,
  installApi,
  NOTE_ID,
  note,
  putCursorAtEnd,
  renderNote,
  row,
  rowId,
  typeText,
} from './editor-apoyo';

// Con temporizadores falsos: el guardado a los dos segundos se mide exacto, sin esperas.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete window.reteniaCierre;
});

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

const text = (value: string): Block['content'] => [{ type: 'text', text: value }];

function openNote(title = 'Regresión lineal') {
  const api = installApi();
  const view = renderNote(note(title, [row(1, 'Hola')]));
  const editor = contentEditor();
  putCursorAtEnd(editor, rowId(1));
  return { api, editor, ...view };
}

const saved = () => screen.queryByText('Guardado');
const saving = () => screen.queryByText('Guardando…');

describe('[CA-043] el guardado automático', () => {
  it('[CA-043] a 1999 ms de dejar de escribir todavía no guardó y a 2000 ms sí, con «Guardado» en el indicador', async () => {
    expect(AUTOSAVE_MS).toBe(2000);
    const { api, editor, onSaved } = openNote();
    expect(saved()).toBeNull();
    expect(saving()).toBeNull();

    typeText(editor, ' mundo');
    expect(saving()).not.toBeNull();
    await advance(1999);
    expect(api.save).not.toHaveBeenCalled();
    expect(saving()).not.toBeNull();

    await advance(1);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith({
      noteId: NOTE_ID,
      title: 'Regresión lineal',
      blocks: [{ id: rowId(1), parentId: null, collapsed: false, content: text('Hola mundo') }],
    });
    await settle();
    expect(saved()).not.toBeNull();
    expect(saving()).toBeNull();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('[CA-043] volver a escribir reinicia el reloj de los dos segundos', async () => {
    const { api, editor } = openNote();
    typeText(editor, ' uno');
    await advance(1500);
    typeText(editor, ' dos');
    await advance(1500);
    expect(api.save).not.toHaveBeenCalled();
    await advance(500);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save.mock.calls[0]?.[0].blocks[0]?.content).toEqual(text('Hola uno dos'));
  });

  it('[CA-043] cambiar el título también guarda a los dos segundos, y el encabezado sigue lo que escribís', async () => {
    const { api } = openNote('');
    expect(screen.getByRole('heading', { level: 3, name: 'Sin título' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Título' }), {
      target: { value: 'Química orgánica' },
    });
    expect(screen.getByRole('heading', { level: 3, name: 'Química orgánica' })).toBeTruthy();
    await advance(1999);
    expect(api.save).not.toHaveBeenCalled();
    await advance(1);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save.mock.calls[0]?.[0].title).toBe('Química orgánica');
  });

  it('[CA-043] sin cambios no hay guardado ni indicador', async () => {
    const { api } = openNote();
    await advance(10_000);
    expect(api.save).not.toHaveBeenCalled();
    expect(saved()).toBeNull();
    expect(saving()).toBeNull();
  });

  it('[CA-043] al cerrar y abrir la nota, lo guardado sigue ahí', async () => {
    const { api, editor, unmount } = openNote();
    typeText(editor, ' y sigue');
    await advance(AUTOSAVE_MS);
    await settle();
    const request = api.save.mock.calls[0]?.[0];
    unmount();

    renderNote(note('Regresión lineal', request?.blocks ?? []));
    expect(contentEditor().state.doc.textContent).toBe('Hola y sigue');
  });

  it('guarda de a una vez: un cambio que llega mientras se guarda espera a que termine y se guarda después', async () => {
    const { api, editor } = openNote();
    const first = deferred<Record<string, never>>();
    api.save.mockReturnValueOnce(first.promise);

    typeText(editor, ' a');
    await advance(AUTOSAVE_MS);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(saving()).not.toBeNull();

    typeText(editor, ' b');
    await advance(AUTOSAVE_MS);
    expect(api.save).toHaveBeenCalledTimes(1);

    first.resolve({});
    await settle();
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save.mock.calls[1]?.[0].blocks[0]?.content).toEqual(text('Hola a b'));
    await settle();
    expect(saved()).not.toBeNull();
  });

  it('un cambio que llega mientras se guarda y todavía no cumplió sus dos segundos no guarda antes de tiempo', async () => {
    const { api, editor } = openNote();
    const first = deferred<Record<string, never>>();
    api.save.mockReturnValueOnce(first.promise);

    typeText(editor, ' a');
    await advance(AUTOSAVE_MS);
    typeText(editor, ' b');
    first.resolve({});
    await settle();
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(saved()).toBeNull();
    await advance(AUTOSAVE_MS);
    expect(api.save).toHaveBeenCalledTimes(2);
  });

  it('si falla avisa, conserva lo escrito en pantalla y lo reintenta con el próximo cambio', async () => {
    const { api, editor, onSaved } = openNote();
    api.save.mockRejectedValueOnce(new Error('disco lleno'));

    typeText(editor, ' a');
    await advance(AUTOSAVE_MS);
    await settle();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(
      'No pude guardar tu nota. Lo que escribiste sigue acá: probá de nuevo.',
    );
    expect(editor.state.doc.textContent).toBe('Hola a');
    expect(saved()).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();

    typeText(editor, ' b');
    await advance(AUTOSAVE_MS);
    await settle();
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save.mock.calls[1]?.[0].blocks[0]?.content).toEqual(text('Hola a b'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(saved()).not.toBeNull();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

describe('[CA-043] guardar lo pendiente de inmediato', () => {
  it('«Volver a las notas» guarda lo pendiente sin esperar los dos segundos y recién después vuelve', async () => {
    const { api, editor, onBack } = openNote();
    const pending = deferred<Record<string, never>>();
    api.save.mockReturnValueOnce(pending.promise);
    typeText(editor, ' final');

    fireEvent.click(screen.getByRole('button', { name: 'Volver a las notas' }));
    await settle();
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();

    pending.resolve({});
    await settle();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledTimes(1);
  });

  it('«Volver a las notas» sin nada pendiente vuelve enseguida y no guarda', async () => {
    const { api, onBack } = openNote();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a las notas' }));
    await settle();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(api.save).not.toHaveBeenCalled();
  });

  it('si al volver no se puede guardar, se queda en la nota con el aviso para no perder lo escrito', async () => {
    const { api, editor, onBack } = openNote();
    api.save.mockRejectedValueOnce(new Error('disco lleno'));
    typeText(editor, ' final');
    fireEvent.click(screen.getByRole('button', { name: 'Volver a las notas' }));
    await settle();
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(editor.state.doc.textContent).toBe('Hola final');
  });

  it('al dejar la pantalla (cambiar de destino, abrir otra nota) guarda lo pendiente enseguida', async () => {
    const { api, editor, unmount } = openNote();
    typeText(editor, ' pendiente');
    unmount();
    await settle();
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save.mock.calls[0]?.[0].blocks[0]?.content).toEqual(text('Hola pendiente'));
  });

  it('al dejar la pantalla con un guardado en curso espera a que termine y guarda lo que llegó después', async () => {
    const { api, editor, unmount } = openNote();
    const first = deferred<Record<string, never>>();
    api.save.mockReturnValueOnce(first.promise);
    typeText(editor, ' a');
    await advance(AUTOSAVE_MS);
    typeText(editor, ' b');
    unmount();
    expect(api.save).toHaveBeenCalledTimes(1);
    first.resolve({});
    await settle();
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save.mock.calls[1]?.[0].blocks[0]?.content).toEqual(text('Hola a b'));
  });

  describe('cuando el puente avisa que se va a cerrar la ventana', () => {
    function registerClose() {
      let handler: () => Promise<void> | void = () => undefined;
      const unregister = vi.fn();
      window.reteniaCierre = {
        alCerrar: (callback) => {
          handler = callback;
          return unregister;
        },
      };
      return { close: () => handler(), unregister };
    }

    it('el aviso espera a que se guarde lo pendiente', async () => {
      const { close } = registerClose();
      const { api, editor } = openNote();
      const pending = deferred<Record<string, never>>();
      api.save.mockReturnValueOnce(pending.promise);
      typeText(editor, ' último');

      let done = false;
      const closing = Promise.resolve(close()).then(() => {
        done = true;
      });
      await settle();
      expect(api.save).toHaveBeenCalledTimes(1);
      expect(done).toBe(false);

      pending.resolve({});
      await act(async () => {
        await closing;
      });
      expect(done).toBe(true);
    });

    it('el aviso cubre un guardado ya en curso y también lo que llegó después', async () => {
      const { close } = registerClose();
      const { api, editor } = openNote();
      const first = deferred<Record<string, never>>();
      const second = deferred<Record<string, never>>();
      api.save.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      typeText(editor, ' a');
      await advance(AUTOSAVE_MS);
      typeText(editor, ' b');

      let done = false;
      const closing = Promise.resolve(close()).then(() => {
        done = true;
      });
      await settle();
      expect(done).toBe(false);
      first.resolve({});
      await settle();
      expect(api.save).toHaveBeenCalledTimes(2);
      expect(done).toBe(false);
      second.resolve({});
      await act(async () => {
        await closing;
      });
      expect(done).toBe(true);
      expect(api.save.mock.calls[1]?.[0].blocks[0]?.content).toEqual(text('Hola a b'));
    });

    it('sin nada pendiente el aviso se resuelve enseguida, y al dejar la pantalla se desregistra', async () => {
      const { close, unregister } = registerClose();
      const { api, unmount } = openNote();
      await act(async () => {
        await close();
      });
      expect(api.save).not.toHaveBeenCalled();
      unmount();
      expect(unregister).toHaveBeenCalled();
    });
  });
});
