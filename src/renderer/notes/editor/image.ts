import { Extension, Node } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGE_SIDE } from '../../../preload/contract/notes';
import { texts } from '../../../preload/contract/texts';
import { ImageView } from './ImageView';

type ImageType = (typeof IMAGE_TYPES)[number];

const isImageType = (type: string): type is ImageType =>
  IMAGE_TYPES.some((known) => known === type);

// La imagen en el renglón: un nodo chico con la huella del archivo (que vive en la carpeta de
// datos) y su tamaño.
export const Image = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      sha: { default: '' },
      width: { default: 1 },
      height: { default: 1 },
      alt: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-sha]',
        getAttrs: (element) => ({
          sha: element.getAttribute('data-sha') ?? '',
          width: Number(element.getAttribute('width')) || 1,
          height: Number(element.getAttribute('height')) || 1,
          alt: element.getAttribute('alt') ?? '',
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      'img',
      {
        'data-sha': node.attrs.sha,
        width: node.attrs.width,
        height: node.attrs.height,
        alt: node.attrs.alt,
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView, { as: 'span' });
  },
});

export interface ImageInputOptions {
  onError: () => void;
}

// Los archivos de imagen de un pegado o de un arrastre. Lo que no es una imagen (texto, otros
// archivos) no se toca: sigue el camino de siempre.
function imageFilesOf(data: DataTransfer | null): File[] {
  if (data === null) {
    return [];
  }
  const files = [...(data.files ?? [])].filter((file) => file.type.startsWith('image/'));
  if (files.length > 0) {
    return files;
  }
  return [...(data.items ?? [])]
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .flatMap((item) => item.getAsFile() ?? []);
}

// Las medidas las decodifica el navegador.
async function sizeOf(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

async function insertImage(view: EditorView, file: File) {
  if (!isImageType(file.type) || file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error('imagen no aceptada');
  }
  const [buffer, { width, height }] = await Promise.all([file.arrayBuffer(), sizeOf(file)]);
  const bytes = new Uint8Array(buffer);
  if (
    bytes.byteLength > MAX_IMAGE_BYTES ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_SIDE ||
    height > MAX_IMAGE_SIDE
  ) {
    throw new Error('imagen no aceptada');
  }
  const { sha } = await window.retenia['images.save']({ bytes, mime: file.type, width, height });
  const node = view.state.schema.nodes.image?.create({
    sha,
    width,
    height,
    alt: texts.notes.editor.imageAlt,
  });
  if (node && !view.isDestroyed) {
    view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
  }
}

// Al soltar, el cursor pasa al lugar donde se soltó el archivo (si se puede saber).
function moveCursorToDrop(view: EditorView, event: DragEvent) {
  try {
    const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (found && view.state.doc.resolve(found.pos).parent.inlineContent) {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, found.pos)));
    }
  } catch {
    // Sin medidas de pantalla se queda donde estaba.
  }
}

// Pegar una imagen del portapapeles o soltar un archivo en un renglón: se guarda en la carpeta de
// datos y queda el nodo con su huella. Una imagen que no se puede guardar avisa y no deja nada.
export const ImageInput = Extension.create<ImageInputOptions>({
  name: 'imageInput',

  addOptions() {
    return { onError: () => undefined };
  },

  addProseMirrorPlugins() {
    const { onError } = this.options;
    const handle = (view: EditorView, event: Event, data: DataTransfer | null) => {
      const files = imageFilesOf(data);
      if (files.length === 0) {
        return false;
      }
      event.preventDefault();
      if (event.type === 'drop') {
        moveCursorToDrop(view, event as DragEvent);
      }
      void (async () => {
        for (const file of files) {
          try {
            await insertImage(view, file);
          } catch {
            onError();
          }
        }
      })();
      return true;
    };
    return [
      new Plugin({
        key: new PluginKey('imageInput'),
        props: {
          handleDOMEvents: {
            paste: (view, event) => handle(view, event, (event as ClipboardEvent).clipboardData),
            drop: (view, event) => handle(view, event, (event as DragEvent).dataTransfer),
          },
        },
      }),
    ];
  },
});
