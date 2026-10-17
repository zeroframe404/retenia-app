// Dónde cae una frase sobre la imagen de una página: a partir de los renglones que extrae el
// lector de PDF (cada uno con su texto y su caja en la hoja, en puntos y desde arriba a la
// izquierda), los rectángulos a resaltar. Un corte de renglón cuenta como un espacio y los
// espacios repetidos no importan. Dentro de un renglón, el tramo se calcula en proporción a la
// cantidad de letras: alcanza para resaltar, aunque no todas las letras midan lo mismo.

export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const collapse = (text: string) => text.replace(/\s+/gu, ' ');

export function locatePhrase(items: readonly TextItem[], phrase: string): Rect[] | null {
  const wanted = collapse(phrase).trim();
  if (wanted === '') {
    return null;
  }
  // El texto de la página de corrido y, para cada renglón, dónde empieza en ese texto.
  const lines = items
    .map((item) => ({ item, text: collapse(item.text).trim() }))
    .filter((line) => line.text !== '');
  let page = '';
  const starts: number[] = [];
  for (const line of lines) {
    if (page !== '') {
      page += ' ';
    }
    starts.push(page.length);
    page += line.text;
  }
  const from = page.indexOf(wanted);
  if (from === -1) {
    return null;
  }
  const to = from + wanted.length;
  const rects: Rect[] = [];
  lines.forEach(({ item, text }, index) => {
    const start = starts[index] ?? 0;
    const end = start + text.length;
    const first = Math.max(from, start);
    const last = Math.min(to, end);
    if (first >= last) {
      return;
    }
    const share = item.width / text.length;
    rects.push({
      x: item.x + (first - start) * share,
      y: item.y,
      // El renglón entero lleva su ancho tal cual, sin redondeos de la proporción.
      width: last - first === text.length ? item.width : (last - first) * share,
      height: item.height,
    });
  });
  return rects;
}
