import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { newBlockId } from './block-id';

// Todo renglón tiene un identificador y no hay dos iguales. Al partir un renglón con Enter el
// nuevo hereda el del otro, y al pegar pueden llegar renglones con identificadores repetidos o sin
// identificador: el primero del documento conserva el suyo y los demás reciben uno nuevo.
export const UniqueBlockIds = Extension.create({
  name: 'uniqueBlockIds',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('uniqueBlockIds'),
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }
          const seen = new Set<string>();
          const tr = state.tr;
          let changed = false;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'listItem') {
              return true;
            }
            const id: unknown = node.attrs.blockId;
            if (typeof id === 'string' && id !== '' && !seen.has(id)) {
              seen.add(id);
              return true;
            }
            const fresh = newBlockId();
            seen.add(fresh);
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: fresh });
            changed = true;
            return true;
          });
          return changed ? tr : null;
        },
      }),
    ];
  },
});
