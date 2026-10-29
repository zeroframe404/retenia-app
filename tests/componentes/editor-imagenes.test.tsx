import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOSAVE_MS, MAX_IMAGE_BYTES } from '../../src/preload/contract/notes';
import {
  contentEditor,
  contentElement,
  installApi,
  note,
  PNG,
  putCursorAtEnd,
  renderNote,
  row,
  rowId,
  SHA_A,
  SHA_B,
} from './editor-apoyo';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const IMAGE_FAILED = 'No pude guardar la imagen.';
const LOAD_FAILED = 'No pude mostrar la imagen.';

function pngFile(name = 'captura.png', type = 'image/png') {
  return new File([PNG], name, { type });
}

// Lo que el navegador entrega al pegar o soltar: los archivos y, para texto, getData.
function clipboard(files: File[], plain = '') {
  return {
    files,
    items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    types: files.length > 0 ? ['Files'] : ['text/plain'],
    getData: (type: string) => (type === 'text/plain' ? plain : ''),
  };
}

function send(type: 'paste' | 'drop', data: ReturnType<typeof clipboard>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, type === 'paste' ? 'clipboardData' : 'dataTransfer', {
    value: data,
  });
  act(() => {
    contentEditor().view.dom.dispatchEvent(event);
  });
  return event;
}

// La decodificación de la imagen es del navegador (una frontera): acá devuelve un tamaño fijo.
function stubDecoder(width = 640, height = 480) {
  const close = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width, height, close })),
  );
}

const imageNodes = () => {
  const found: Record<string, unknown>[] = [];
  contentEditor().state.doc.descendants((node) => {
    if (node.type.name === 'image') {
      found.push(node.attrs);
    }
  });
  return found;
};

beforeEach(() => {
  stubDecoder();
});

describe('[CA-372] imágenes pegadas o soltadas en un renglón', () => {
  it('[CA-372] pegar una imagen la guarda con sus bytes, su tipo y su tamaño, e inserta el nodo con la huella devuelta', async () => {
    const api = installApi();
    api.saveImage.mockResolvedValue({ sha: SHA_A });
    renderNote(note('Con imagen', [row(1, 'Mirá esto: ')]));
    putCursorAtEnd(contentEditor(), rowId(1));

    const event = send('paste', clipboard([pngFile()]));
    expect(event.defaultPrevented).toBe(true);

    await waitFor(() => expect(imageNodes()).toHaveLength(1));
    expect(api.saveImage).toHaveBeenCalledTimes(1);
    const request = api.saveImage.mock.calls[0]?.[0];
    expect(request?.mime).toBe('image/png');
    expect(request?.width).toBe(640);
    expect(request?.height).toBe(480);
    expect([...(request?.bytes ?? [])]).toEqual([...PNG]);
    expect(imageNodes()[0]).toEqual({
      sha: SHA_A,
      width: 640,
      height: 480,
      alt: 'Imagen de la nota',
    });
    expect(contentEditor().state.doc.textContent).toBe('Mirá esto: ');
  });

  it('[CA-372] la imagen se ve en el renglón con los bytes que devuelve el principal, como datos en línea', async () => {
    const api = installApi();
    renderNote(note('Con imagen', [row(1, '')]));
    send('paste', clipboard([pngFile()]));

    const image = await screen.findByRole('img', { name: 'Imagen de la nota' });
    await waitFor(() => expect(image.getAttribute('src')).toMatch(/^data:image\/png;base64,/));
    expect(api.readImage).toHaveBeenCalledWith({ sha: SHA_A });
    const base64 = (image.getAttribute('src') ?? '').split(',')[1] ?? '';
    expect([...Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))]).toEqual([...PNG]);
  });

  it('[CA-372] soltar un archivo de imagen en el renglón también la inserta', async () => {
    const api = installApi();
    renderNote(note('Arrastrada', [row(1, 'Texto')]));
    putCursorAtEnd(contentEditor(), rowId(1));

    const event = send('drop', clipboard([pngFile('foto.jpg', 'image/jpeg')]));
    expect(event.defaultPrevented).toBe(true);

    await waitFor(() => expect(imageNodes()).toHaveLength(1));
    expect(api.saveImage.mock.calls[0]?.[0].mime).toBe('image/jpeg');
  });

  it('[CA-372] acepta PNG, JPEG, GIF y WebP', async () => {
    const api = installApi();
    renderNote(note('Tipos', [row(1, '')]));
    for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      send('paste', clipboard([pngFile('x', type)]));
    }
    await waitFor(() => expect(imageNodes()).toHaveLength(4));
    expect(api.saveImage.mock.calls.map(([request]) => request.mime).sort()).toEqual([
      'image/gif',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  });

  it('[CA-372] un tipo no aceptado (SVG) no se guarda ni se inserta, y se avisa', async () => {
    const api = installApi();
    renderNote(note('SVG', [row(1, '')]));
    send('paste', clipboard([pngFile('dibujo.svg', 'image/svg+xml')]));

    expect((await screen.findByRole('alert')).textContent).toContain(IMAGE_FAILED);
    expect(api.saveImage).not.toHaveBeenCalled();
    expect(imageNodes()).toHaveLength(0);
  });

  it('[CA-372] una imagen de más de 10 MB no se guarda ni se inserta, y se avisa', async () => {
    const api = installApi();
    renderNote(note('Enorme', [row(1, '')]));
    const big = pngFile('enorme.png');
    Object.defineProperty(big, 'size', { value: MAX_IMAGE_BYTES + 1 });
    send('paste', clipboard([big]));

    expect((await screen.findByRole('alert')).textContent).toContain(IMAGE_FAILED);
    expect(api.saveImage).not.toHaveBeenCalled();
    expect(imageNodes()).toHaveLength(0);
  });

  it('[CA-372] si el principal no puede guardarla, no queda un nodo roto y se avisa', async () => {
    const api = installApi();
    api.saveImage.mockRejectedValue(new Error('disco lleno'));
    renderNote(note('Falla', [row(1, '')]));
    send('paste', clipboard([pngFile()]));

    expect((await screen.findByRole('alert')).textContent).toContain(IMAGE_FAILED);
    expect(imageNodes()).toHaveLength(0);
  });

  it('[CA-372] si no se puede leer el tamaño de la imagen no se guarda y se avisa', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('no es una imagen');
      }),
    );
    const api = installApi();
    renderNote(note('Rota', [row(1, '')]));
    send('paste', clipboard([pngFile()]));

    expect((await screen.findByRole('alert')).textContent).toContain(IMAGE_FAILED);
    expect(api.saveImage).not.toHaveBeenCalled();
  });

  it('[CA-372] el texto pegado que no es una imagen se pega como siempre', async () => {
    const api = installApi();
    renderNote(note('Texto', [row(1, 'Hola')]));
    putCursorAtEnd(contentEditor(), rowId(1));
    const event = send('paste', clipboard([], ' mundo'));

    expect(api.saveImage).not.toHaveBeenCalled();
    expect(imageNodes()).toHaveLength(0);
    expect(event.defaultPrevented).toBe(true);
    expect(contentEditor().state.doc.textContent).toBe('Hola mundo');
  });

  it('[CA-372] la imagen guardada vuelve a verse al abrir la nota y viaja en el guardado con su huella y su tamaño', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const api = installApi();
    renderNote(note('Con imagen', [row(1, 'Mirá: ')]));
    putCursorAtEnd(contentEditor(), rowId(1));
    send('paste', clipboard([pngFile()]));
    await act(async () => {
      await vi.waitFor(() => expect(imageNodes()).toHaveLength(1));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    });
    const saved = api.save.mock.calls[0]?.[0].blocks;
    expect(saved?.[0]?.content).toEqual([
      { type: 'text', text: 'Mirá: ' },
      { type: 'image', sha: SHA_A, width: 640, height: 480, alt: 'Imagen de la nota' },
    ]);
    cleanup();

    renderNote(note('Con imagen', saved ?? []));
    await act(async () => {
      await vi.waitFor(() =>
        expect(screen.getByRole('img', { name: 'Imagen de la nota' }).getAttribute('src')).toMatch(
          /^data:image\/png;base64,/,
        ),
      );
    });
  });
});

describe('[CA-372] el dibujo de la imagen', () => {
  const withImages = (...shas: string[]) =>
    note(
      'Imágenes',
      shas.map((sha, index) =>
        row(index + 1, '', {
          content: [{ type: 'image', sha, width: 30, height: 20, alt: `Imagen ${index + 1}` }],
        }),
      ),
    );

  it('[CA-372] pide los bytes una sola vez por huella, aunque la imagen esté dos veces', async () => {
    const api = installApi();
    renderNote(withImages(SHA_A, SHA_A, SHA_B));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('img')
          .every((img) => (img.getAttribute('src') ?? '').startsWith('data:')),
      ).toBe(true),
    );
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(api.readImage.mock.calls.map(([request]) => request.sha).sort()).toEqual([SHA_A, SHA_B]);
  });

  it('[CA-372] usa el texto alternativo de cada imagen y el ancho y el alto de lo guardado', async () => {
    installApi();
    renderNote(withImages(SHA_A));
    const image = await screen.findByRole('img', { name: 'Imagen 1' });
    expect(image.getAttribute('width')).toBe('30');
    expect(image.getAttribute('height')).toBe('20');
  });

  it('[CA-372] una imagen sin texto alternativo se llama «Imagen de la nota»', async () => {
    installApi();
    renderNote(
      note('Sin alt', [
        row(1, '', { content: [{ type: 'image', sha: SHA_A, width: 3, height: 2, alt: '' }] }),
      ]),
    );
    expect(await screen.findByRole('img', { name: 'Imagen de la nota' })).toBeTruthy();
  });

  it('[CA-372] si no se pueden leer los bytes dice «No pude mostrar la imagen.»', async () => {
    const api = installApi();
    api.readImage.mockRejectedValue(new Error('no está'));
    renderNote(withImages(SHA_A));
    expect(await screen.findByText(LOAD_FAILED)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('[CA-372] la imagen no se puede alcanzar con Tab: el editor sigue siendo una sola parada', async () => {
    installApi();
    renderNote(withImages(SHA_A));
    const image = await screen.findByRole('img', { name: 'Imagen 1' });
    expect(image.getAttribute('tabindex')).toBeNull();
    expect(contentElement().contains(image)).toBe(true);
  });
});
