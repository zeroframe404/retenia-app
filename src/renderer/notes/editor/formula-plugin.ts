import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import styles from './editor.module.css';
import { findFormulas } from './formula';
import { drawFormula as draw } from './formula-render';

export const Formulas = Extension.create({
  name: 'formulas',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('formulas'),
        props: {
          decorations(state) {
            const { from, to } = state.selection;
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) {
                return true;
              }
              for (const formula of findFormulas(node.text)) {
                const start = pos + formula.from;
                const end = pos + formula.to;
                if (from <= end && to >= start) {
                  continue;
                }
                const template = draw(formula.source);
                if (template === null) {
                  continue;
                }
                decorations.push(
                  Decoration.inline(start, end, {
                    class: styles.formulaSource ?? '',
                    'data-formula': 'source-hidden',
                  }),
                  Decoration.widget(
                    start,
                    (view, getPos) => {
                      const widget = document.createElement('span');
                      widget.className = styles.formula ?? '';
                      widget.dataset.formula = 'rendered';
                      widget.contentEditable = 'false';
                      widget.append(template.cloneNode(true));
                      // Un clic en la fórmula lleva el cursor adentro: se ve el texto para editarlo.
                      widget.addEventListener('mousedown', (event) => {
                        event.preventDefault();
                        const at = getPos();
                        if (at !== undefined) {
                          view.dispatch(
                            view.state.tr.setSelection(
                              TextSelection.create(view.state.doc, at + 1),
                            ),
                          );
                        }
                        view.focus();
                      });
                      return widget;
                    },
                    { side: -1, key: `formula:${start}:${formula.source}` },
                  ),
                );
              }
              return true;
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
