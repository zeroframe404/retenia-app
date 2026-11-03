import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { findMentionTrigger } from './mention-suggestion';

export interface MentionSuggestionState {
  // El tramo escrito, desde «[[» hasta el cursor.
  from: number;
  to: number;
  query: string;
  // Esc cerró la lista: no se vuelve a abrir hasta que se escriba otro «[[».
  dismissed: boolean;
}

export interface MentionSuggestionOptions {
  onChange: (state: MentionSuggestionState | null) => void;
  // Las teclas con la lista abierta; devuelve verdadero si las usó.
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const key = new PluginKey<MentionSuggestionState | null>('mentionSuggestion');

export function dismissMention(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(key, { dismiss: true }));
}

export function insertMention(
  view: EditorView,
  range: { from: number; to: number },
  mention: { id: string; label: string },
) {
  const node = view.state.schema.nodes.mention?.create(mention);
  if (node) {
    view.dispatch(view.state.tr.replaceWith(range.from, range.to, node));
    view.focus();
  }
}

function active(state: MentionSuggestionState | null | undefined) {
  return state && !state.dismissed ? state : null;
}

// «[[» y las primeras letras: aparece la lista de notas para enlazar. Es un complemento propio y
// no el disparador de dos caracteres de Tiptap: así el comportamiento de «[[» no depende de una
// expresión regular que el paquete no documenta.
export const MentionSuggestion = Extension.create<MentionSuggestionOptions>({
  name: 'mentionSuggestion',
  // Antes que las teclas de los renglones: con la lista abierta, Enter elige y no parte el renglón.
  priority: 1100,

  addOptions() {
    return { onChange: () => undefined, onKeyDown: () => false };
  },

  addProseMirrorPlugins() {
    const { onChange, onKeyDown } = this.options;
    return [
      new Plugin<MentionSuggestionState | null>({
        key,
        state: {
          init: () => null,
          apply(tr, previous, _old, state) {
            const { selection } = state;
            if (!selection.empty || !selection.$from.parent.isTextblock) {
              return null;
            }
            const { $from } = selection;
            const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
            const trigger = findMentionTrigger(before);
            if (trigger === null) {
              return null;
            }
            const from = $from.pos - trigger.length;
            const dismissed =
              tr.getMeta(key)?.dismiss === true ||
              (previous?.dismissed === true && previous.from === from);
            return { from, to: $from.pos, query: trigger.query, dismissed };
          },
        },
        props: {
          handleKeyDown(view, event) {
            return active(key.getState(view.state)) === null ? false : onKeyDown(event);
          },
        },
        view() {
          return {
            update(view) {
              onChange(active(key.getState(view.state)));
            },
          };
        },
      }),
    ];
  },
});
