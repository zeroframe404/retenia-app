import { Node } from '@tiptap/core';
import { type Command, Plugin, PluginKey } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { RowView } from './RowView';
import {
  backspaceRow,
  foldRow,
  liftRow,
  moveRow,
  selectionOutOfFolded,
  sinkRow,
  splitRow,
} from './row-commands';

// El documento de una nota: una sola lista de renglones. Cada renglón es un párrafo y, si tiene
// hijos, otra lista adentro. Sin títulos, citas, listas numeradas ni formato.
export const RowsDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: 'bulletList',
});

export const RowList = Node.create({
  name: 'bulletList',
  content: 'listItem+',

  parseHTML() {
    return [{ tag: 'ul' }];
  },

  renderHTML() {
    return ['ul', 0];
  },
});

export const Row = Node.create({
  name: 'listItem',
  // Antes que las teclas de Tiptap por defecto: Enter, Retroceso y Tab son de los renglones.
  priority: 1000,
  // La gramática de ProseMirror (un párrafo y, si hay hijos, su lista), no un texto de pantalla.
  content: ['paragraph', 'bulletList?'].join(' '),
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-block-id'),
        renderHTML: (attributes) =>
          typeof attributes.blockId === 'string' ? { 'data-block-id': attributes.blockId } : {},
      },
      collapsed: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes) => ({ 'data-collapsed': String(attributes.collapsed === true) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'li' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['li', HTMLAttributes, 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(RowView, {
      as: 'li',
      // Quién es el renglón y si está plegado, para los estilos y para encontrarlo en la pantalla.
      attrs: ({ node }) => ({
        ...(typeof node.attrs.blockId === 'string' ? { 'data-block-id': node.attrs.blockId } : {}),
        'data-collapsed': String(node.attrs.collapsed === true),
      }),
    });
  },

  addKeyboardShortcuts() {
    const { type } = this;
    const apply = (command: Command) => () => {
      const { view } = this.editor;
      return command(view.state, (tr) => view.dispatch(tr), view);
    };
    return {
      Enter: apply(splitRow(type)),
      Tab: apply(sinkRow(type)),
      'Shift-Tab': apply(liftRow(type)),
      Backspace: apply(backspaceRow(type)),
      'Alt-Shift-ArrowUp': apply(moveRow('up')),
      'Alt-Shift-ArrowDown': apply(moveRow('down')),
      'Ctrl-ArrowUp': apply(foldRow(true)),
      'Ctrl-ArrowDown': apply(foldRow(false)),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('keepSelectionOutOfFolded'),
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.selectionSet || tr.docChanged)) {
            return null;
          }
          const selection = selectionOutOfFolded(state);
          return selection === null ? null : state.tr.setSelection(selection);
        },
      }),
    ];
  },
});
