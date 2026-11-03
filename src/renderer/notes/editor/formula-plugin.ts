import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import styles from './editor.module.css';
import { findFormulas } from './formula';

const MAX_REMEMBERED = 500;

// Cada fórmula se dibuja una sola vez; lo que KaTeX no entiende queda en null (se ve el texto).
const drawn = new Map<string, HTMLElement | null>();

// KaTeX arma nodos del navegador (nada de cadenas de HTML con `style`, que la política de contenido
// de la ventana descartaría). Con `throwOnError` una fórmula inválida da un error en vez de pintarse
// de color: así se queda el texto original.
function draw(source: string): HTMLElement | null {
  const known = drawn.get(source);
  if (known !== undefined) {
    return known;
  }
  const element = document.createElement('span');
  let result: HTMLElement | null = element;
  try {
    katex.render(source, element, {
      throwOnError: true,
      trust: false,
      strict: 'ignore',
      output: 'htmlAndMathml',
    });
  } catch {
    result = null;
  }
  if (drawn.size >= MAX_REMEMBERED) {
    drawn.clear();
  }
  drawn.set(source, result);
  return result;
}

// Lo que está entre signos $ sigue siendo texto de la nota (así se guarda y así lo encuentra el
// buscador). Mientras el cursor o la selección no tocan ese tramo, un dibujo de KaTeX lo reemplaza
// a la vista; al entrar, se ve el texto original para editarlo.
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
