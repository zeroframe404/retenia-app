import katex from 'katex';
import 'katex/dist/katex.min.css';

const MAX_REMEMBERED = 500;

// Cada fórmula se dibuja una sola vez; lo que KaTeX no entiende queda en null (se ve el texto).
const drawn = new Map<string, HTMLElement | null>();

// KaTeX arma nodos del navegador (nada de cadenas de HTML con `style`, que la política de contenido
// de la ventana descartaría). Con `throwOnError` una fórmula inválida da un error en vez de pintarse
// de color: así se queda el texto original. La usan el editor de notas y las tarjetas.
export function drawFormula(source: string): HTMLElement | null {
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
