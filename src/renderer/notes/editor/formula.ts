export interface FormulaSpan {
  // Posiciones en el texto, con los signos $ incluidos.
  from: number;
  to: number;
  // Lo de adentro de los signos.
  source: string;
}

// Una fórmula va entre dos $ en una sola línea, sin $ adentro y con algo que se vea: el primer
// carácter de adentro y el último no son espacios, y detrás del que cierra no hay un dígito. Así
// «Pagué $500 y después $300» no se toma por una fórmula.
const FORMULA = /\$(?=[^\s$])([^$\n]*?[^\s$])\$(?!\d)/g;

export function findFormulas(text: string): FormulaSpan[] {
  const found: FormulaSpan[] = [];
  for (const match of text.matchAll(FORMULA)) {
    const source = match[1];
    if (source !== undefined) {
      found.push({ from: match.index, to: match.index + match[0].length, source });
    }
  }
  return found;
}
