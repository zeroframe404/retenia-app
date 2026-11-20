// El HTML que traen los archivos ajenos (los campos de Anki, lo que se cuele en un Markdown de
// RemNote) pasado a texto, sin un navegador: es dato, nunca instrucción. Lo que puede ejecutar algo
// (scripts, estilos, marcos, objetos) se va con todo su contenido; las demás etiquetas se van y queda
// su texto; los saltos de bloque quedan como saltos de línea.

const DANGEROUS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'noscript',
  'template',
  'svg',
  'math',
  'head',
  'title',
];
const BREAKS = /^(br|div|p|li|tr|hr|h[1-6]|ul|ol|table|blockquote|pre|section|article)$/i;

const NAMED: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  laquo: '«',
  raquo: '»',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  middot: '·',
  deg: '°',
  times: '×',
  divide: '÷',
  plusmn: '±',
  le: '≤',
  ge: '≥',
  ne: '≠',
  rarr: '→',
  larr: '←',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  Uuml: 'Ü',
  iquest: '¿',
  iexcl: '¡',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (whole, code: string) => {
    if (code.startsWith('#')) {
      const value =
        code[1] === 'x' || code[1] === 'X'
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      if (
        !Number.isFinite(value) ||
        value <= 0 ||
        value > 0x10ffff ||
        (value >= 0xd800 && value <= 0xdfff)
      ) {
        return '';
      }
      return String.fromCodePoint(value);
    }
    return NAMED[code] ?? whole;
  });
}

// Saca lo peligroso con su contenido (aunque falte la etiqueta de cierre) y los comentarios.
export function removeDangerous(html: string): string {
  let text = html.replace(/<!--[\s\S]*?(-->|$)/g, '');
  for (const tag of DANGEROUS) {
    text = text.replace(new RegExp(`<${tag}\\b[\\s\\S]*?(</${tag}\\s*>|$)`, 'gi'), ' ');
  }
  return text;
}

export type HtmlPiece = { kind: 'text'; text: string } | { kind: 'image'; src: string };

// Parte el HTML en texto e imágenes. Los atributos de las etiquetas no se leen, salvo el «src» de una
// imagen.
export function htmlPieces(html: string): HtmlPiece[] {
  const pieces: HtmlPiece[] = [];
  const clean = removeDangerous(html);
  let text = '';
  const tag = /<\s*(\/?)\s*([a-z][a-z0-9-]*)\b([^>]*)>/gi;
  let last = 0;
  for (const match of clean.matchAll(tag)) {
    text += clean.slice(last, match.index);
    last = match.index + match[0].length;
    const name = match[2] ?? '';
    if (name.toLowerCase() === 'img' && match[1] === '') {
      const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(match[3] ?? '');
      const value = src?.[1] ?? src?.[2] ?? src?.[3];
      if (value !== undefined) {
        pieces.push({ kind: 'text', text: decodeEntities(text) });
        text = '';
        pieces.push({ kind: 'image', src: decodeEntities(value) });
      }
    } else if (BREAKS.test(name)) {
      text += '\n';
    }
  }
  // Lo que queda después de la última etiqueta; un «<» suelto sin cerrar se va con lo que sigue.
  text += clean.slice(last).replace(/<[^>]*$/, '');
  pieces.push({ kind: 'text', text: decodeEntities(text) });
  return pieces.filter((piece) => piece.kind === 'image' || piece.text !== '');
}

// Espacios: los blancos seguidos quedan en uno, cada renglón sin blancos en los bordes y sin
// renglones vacíos seguidos.
export function tidy(text: string): string {
  return text
    .replace(/[ \t \r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n');
}

// Solo el texto de un HTML (para los títulos y los filtros «text:»).
export function htmlToPlain(html: string): string {
  return tidy(
    htmlPieces(html)
      .map((piece) => (piece.kind === 'text' ? piece.text : ''))
      .join(''),
  ).trim();
}
