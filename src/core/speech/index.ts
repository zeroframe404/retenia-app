// Lo que muestra «Entendí: “…”» a partir de lo que devuelve la transcripción: Whisper agrega un
// punto al final y mayúscula al principio aunque nadie los haya dicho. Se sacan los signos del
// final, se juntan los espacios y la primera letra va en minúscula, salvo que la primera palabra
// vaya siempre en mayúscula («I», «I'm») o sea una sigla («BBC»).

const TRAILING_PUNCTUATION = /[\s.!?…]+$/u;

function keepsCapital(firstWord: string): boolean {
  if (firstWord === 'I' || firstWord.startsWith("I'")) {
    return true;
  }
  const second = firstWord.charAt(1);
  return second !== '' && second === second.toUpperCase() && second !== second.toLowerCase();
}

export function heardText(raw: string): string {
  const text = raw.replace(/\s+/gu, ' ').trim().replace(TRAILING_PUNCTUATION, '');
  if (text === '') {
    return '';
  }
  const firstWord = text.split(' ')[0] ?? '';
  return keepsCapital(firstWord) ? text : text.charAt(0).toLowerCase() + text.slice(1);
}
