// El verificador de citas (Fase 19, CA-177): una cita atribuida a tu material tiene que estar
// letra por letra en el fragmento que se mandó y ubicarse (inicio y fin, para resaltarla). Se
// toleran solo diferencias de espacios y las comillas o puntos suspensivos que el modelo agrega
// alrededor; mayúsculas, tildes y signos tienen que coincidir. Una cita de menos de tres palabras no
// cuenta: se encuentra en cualquier lado y no respalda nada.

const MIN_QUOTE_WORDS = 3;

const WRAPPERS = /^[\s«»“”"'‘’…]+|[\s«»“”"'‘’…]+$/gu;

interface Normalized {
  readonly text: string;
  // Para cada letra del texto normalizado, dónde estaba en el original.
  readonly positions: readonly number[];
}

// NFC y los espacios seguidos (también saltos de renglón) como uno solo.
function normalize(original: string): Normalized {
  let text = '';
  const positions: number[] = [];
  let pendingSpace = -1;
  let index = 0;
  for (const char of original) {
    const at = index;
    index += char.length;
    if (/\s/u.test(char)) {
      if (pendingSpace === -1 && text !== '') {
        pendingSpace = at;
      }
      continue;
    }
    if (pendingSpace !== -1) {
      text += ' ';
      positions.push(pendingSpace);
      pendingSpace = -1;
    }
    const composed = char.normalize('NFC');
    text += composed;
    for (let step = 0; step < composed.length; step++) {
      positions.push(at);
    }
  }
  return { text, positions };
}

export function locateQuote(
  fragment: string,
  quote: string,
): { start: number; end: number } | null {
  const wanted = normalize(quote.normalize('NFC').replace(WRAPPERS, '')).text;
  if (wanted.split(' ').filter((word) => /[\p{L}\p{N}]/u.test(word)).length < MIN_QUOTE_WORDS) {
    return null;
  }
  const source = normalize(fragment.normalize('NFC'));
  const found = source.text.indexOf(wanted);
  if (found === -1) {
    return null;
  }
  const last = found + wanted.length - 1;
  const start = source.positions[found];
  const lastAt = source.positions[last];
  if (start === undefined || lastAt === undefined) {
    return null;
  }
  // El final es la letra siguiente a la última de la cita, en el original.
  const lastChar = fragment.normalize('NFC').codePointAt(lastAt);
  const width = lastChar !== undefined && lastChar > 0xffff ? 2 : 1;
  return { start, end: lastAt + width };
}
