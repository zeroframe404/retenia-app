import { InputRule, Mark } from '@tiptap/core';
import { type Command, Plugin, PluginKey } from '@tiptap/pm/state';
import { newBlockId } from './block-id';
import styles from './editor.module.css';

// El hueco de una tarjeta de completar: una marca sobre el texto que se oculta en la tarjeta. Lleva
// un identificador propio que no cambia aunque cambie el texto (la tarjeta se liga al hueco, no a lo
// que dice). Se crea con Ctrl+Mayús+C sobre la selección o escribiendo «{{texto}}». No se extiende
// al escribir pegado al final del hueco.
const HOLE_TEXT = /\{\{([^{}]+)\}\}$/;

export const Cloze = Mark.create({
  name: 'cloze',
  inclusive: false,
  excludes: '_',

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-cloze'),
        renderHTML: (attributes) =>
          typeof attributes.id === 'string' ? { 'data-cloze': attributes.id } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'mark[data-cloze]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', { ...HTMLAttributes, class: styles.hole ?? '' }, 0];
  },

  addKeyboardShortcuts() {
    const { type } = this;
    const toggle: Command = (state, dispatch) => {
      const { from, to, empty } = state.selection;
      if (empty) {
        // Sin texto elegido no hay nada que ocultar: la tecla igual es del hueco.
        return true;
      }
      let marked = true;
      let anyText = false;
      state.doc.nodesBetween(from, to, (node) => {
        if (node.isText) {
          anyText = true;
          if (!type.isInSet(node.marks)) {
            marked = false;
          }
        }
        return true;
      });
      if (!anyText) {
        return true;
      }
      if (dispatch) {
        const tr = state.tr;
        if (marked) {
          tr.removeMark(from, to, type);
        } else {
          tr.addMark(from, to, type.create({ id: newBlockId() }));
        }
        dispatch(tr.scrollIntoView());
      }
      return true;
    };
    const apply = () => {
      const { view } = this.editor;
      return toggle(view.state, (tr) => view.dispatch(tr), view);
    };
    return { 'Mod-Shift-c': apply, 'Mod-Shift-C': apply };
  },

  addInputRules() {
    const { type } = this;
    return [
      new InputRule({
        find: HOLE_TEXT,
        handler: ({ state, range, match }) => {
          const inner = match[1] ?? '';
          if (inner.trim() === '') {
            return null;
          }
          const text = state.schema.text(inner, [type.create({ id: newBlockId() })]);
          state.tr.replaceWith(range.from, range.to, text).removeStoredMark(type);
          return undefined;
        },
      }),
    ];
  },

  // Dos huecos del mismo renglón nunca comparten identificador (partir un hueco con Enter, pegar
  // dos veces): al segundo se le da uno nuevo. Un hueco recién marcado sin identificador recibe uno.
  addProseMirrorPlugins() {
    const { type } = this;
    return [
      new Plugin({
        key: new PluginKey('clozeIds'),
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }
          const tr = state.tr;
          let changed = false;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'paragraph') {
              return true;
            }
            const seen = new Set<string>();
            let previousId: string | null = null;
            let end = -1;
            node.forEach((child, offset) => {
              const from = pos + 1 + offset;
              const mark = child.isText ? type.isInSet(child.marks) : undefined;
              if (!mark) {
                previousId = null;
                return;
              }
              const id: unknown = mark.attrs.id;
              const continues = from === end && typeof id === 'string' && id === previousId;
              if (continues) {
                end = from + child.nodeSize;
                return;
              }
              if (typeof id === 'string' && id !== '' && !seen.has(id)) {
                seen.add(id);
                previousId = id;
                end = from + child.nodeSize;
                return;
              }
              const fresh = newBlockId();
              seen.add(fresh);
              tr.addMark(from, from + child.nodeSize, type.create({ id: fresh }));
              changed = true;
              previousId = fresh;
              end = from + child.nodeSize;
            });
            return false;
          });
          return changed ? tr : null;
        },
      }),
    ];
  },
});
