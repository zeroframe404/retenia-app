import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MentionView } from './MentionView';

export interface MentionOptions {
  // Un clic (o Enter) en el enlace: abre la nota por su identificador.
  onOpen: (noteId: string) => void;
}

// El enlace a otra nota: un nodo chico que guarda el identificador de la nota y el nombre que tenía
// al armarse. El nombre que se ve lo trae la nota abierta (ya refrescado), así renombrar la nota
// enlazada no rompe nada.
export const Mention = Node.create<MentionOptions>({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { onOpen: () => undefined };
  },

  addAttributes() {
    return {
      id: { default: '' },
      label: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-mention-id]',
        getAttrs: (element) => ({
          id: element.getAttribute('data-mention-id') ?? '',
          label: element.textContent ?? '',
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return ['a', { 'data-mention-id': node.attrs.id }, node.attrs.label];
  },

  addNodeView() {
    // Las teclas que se aprietan con el foco en el enlace no son del editor: Tab sigue su camino y
    // Enter abre la nota sin partir ningún renglón.
    return ReactNodeViewRenderer(MentionView, {
      as: 'span',
      stopEvent: ({ event }) => event.type === 'keydown',
    });
  },
});
