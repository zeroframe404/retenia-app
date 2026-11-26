// El verificador de citas (Fase 19, CA-177): una cita atribuida a tu material tiene que estar
// letra por letra en el fragmento que se mandó y ubicarse (inicio y fin, para resaltarla). Se
// toleran solo diferencias de espacios y las comillas o puntos suspensivos que el modelo agrega
// alrededor; mayúsculas, tildes y signos tienen que coincidir. Una cita de menos de tres palabras no
// cuenta: se encuentra en cualquier lado y no respalda nada.

const MIN_QUOTE_WORDS = 3;

const WRAPPERS = /^[\s«»“”"'‘’…]+|[\s«»“”"'‘’…]+$/gu;

interface Normalized {
  readonly text: string;
  // Para cada letra del texto normalizado, dónde empieza y dónde termina en el original.
  readonly starts: readonly number[];
  readonly ends: readonly number[];
}

// Una letra con sus marcas (una tilde aparte, «a» + «◌́»), para componerla junta.
const CLUSTER = /\P{M}\p{M}*|\p{M}+/gu;

// NFC y los espacios seguidos (también saltos de renglón) como uno solo, recordando de dónde sale
// cada letra en el texto tal como está (que puede no estar en NFC).
function normalize(original: string): Normalized {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let pendingSpace = -1;
  for (const match of original.matchAll(CLUSTER)) {
    const cluster = match[0];
    const at = match.index;
    const end = at + cluster.length;
    if (/^\s+$/u.test(cluster)) {
      if (pendingSpace === -1 && text !== '') {
        pendingSpace = at;
      }
      continue;
    }
    if (pendingSpace !== -1) {
      text += ' ';
      starts.push(pendingSpace);
      ends.push(pendingSpace + 1);
      pendingSpace = -1;
    }
    const composed = cluster.normalize('NFC');
    text += composed;
    for (let step = 0; step < composed.length; step++) {
      starts.push(at);
      ends.push(end);
    }
  }
  return { text, starts, ends };
}

export function locateQuote(
  fragment: string,
  quote: string,
): { start: number; end: number } | null {
  const wanted = normalize(quote.normalize('NFC').replace(WRAPPERS, '')).text;
  if (wanted.split(' ').filter((word) => /[\p{L}\p{N}]/u.test(word)).length < MIN_QUOTE_WORDS) {
    return null;
  }
  const source = normalize(fragment);
  const found = source.text.indexOf(wanted);
  if (found === -1) {
    return null;
  }
  // El inicio y el final, en el texto tal como está.
  const start = source.starts[found];
  const end = source.ends[found + wanted.length - 1];
  if (start === undefined || end === undefined) {
    return null;
  }
  return { start, end };
}
