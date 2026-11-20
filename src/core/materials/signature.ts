import { decodeText, looksLikeMarkdown } from './text';

// El tipo de un material sale de los primeros bytes de su contenido, no de cómo se llama (H-25,
// CA-108). La extensión solo sirve para una cosa: si el nombre dice PDF o Word y el contenido no
// lo es, el archivo miente y se rechaza.

export type MaterialKind = 'pdf' | 'docx' | 'md' | 'text' | 'web';

type IdentifyProblem = 'empty' | 'unsupported' | 'notPdf' | 'notWord';

export type Identified = { ok: true; kind: MaterialKind } | { ok: false; problem: IdentifyProblem };

// Cuántos bytes del principio alcanzan para decidir.
export const HEAD_BYTES = 8192;

// La firma de un PDF puede venir después de un poco de basura: se la busca en los primeros 1024.
const PDF_WINDOW = 1024;

type NameSays = 'pdf' | 'docx' | 'md' | 'txt' | null;

function nameSays(name: string): NameSays {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  const extension = match?.[1]?.toLowerCase();
  if (extension === 'pdf') {
    return 'pdf';
  }
  if (extension === 'docx') {
    return 'docx';
  }
  if (extension === 'md' || extension === 'markdown') {
    return 'md';
  }
  if (extension === 'txt') {
    return 'txt';
  }
  return null;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], at = 0): boolean {
  return signature.every((value, index) => bytes[at + index] === value);
}

// Dónde empieza la firma de PDF dentro de los primeros 1024 bytes, o null.
function pdfSignatureAt(head: Uint8Array): number | null {
  const start = head.subarray(0, PDF_WINDOW + 5);
  for (let at = 0; at + 5 <= start.length && at <= PDF_WINDOW; at++) {
    if (startsWith(start, [0x25, 0x50, 0x44, 0x46, 0x2d], at)) {
      return at;
    }
  }
  return null;
}

// Una firma de PDF que no está al principio cuenta si el nombre dice PDF o si lo que hay antes no
// es texto: un Markdown o un texto que menciona «%PDF-» en su primer renglón sigue siendo texto.
function isPdf(head: Uint8Array, says: NameSays): boolean {
  const at = pdfSignatureAt(head);
  if (at === null) {
    return false;
  }
  return at === 0 || says === 'pdf' || decodeText(head.subarray(0, at), { partial: true }) === null;
}

const ZIP = [0x50, 0x4b, 0x03, 0x04];

// Firmas de archivos que Retenia no lee (todavía): imágenes, audio, video, comprimidos de otro tipo.
const OTHER_BINARIES: readonly (readonly number[])[] = [
  [0x89, 0x50, 0x4e, 0x47],
  [0xff, 0xd8, 0xff],
  [0x47, 0x49, 0x46, 0x38],
  [0x42, 0x4d],
  [0x52, 0x49, 0x46, 0x46],
  [0x49, 0x44, 0x33],
  [0x4f, 0x67, 0x67, 0x53],
  [0x66, 0x4c, 0x61, 0x43],
  [0x1f, 0x8b],
  [0x37, 0x7a, 0xbc, 0xaf],
  [0x52, 0x61, 0x72, 0x21],
  [0xd0, 0xcf, 0x11, 0xe0],
  [0x4d, 0x5a],
];

const isHtml = (text: string) => /^\s*<(!doctype\s+html|html[\s>])/i.test(text);

export function identifyContent({
  head,
  size,
  name,
}: {
  head: Uint8Array;
  size: number;
  name: string;
}): Identified {
  if (size === 0 || head.length === 0) {
    return { ok: false, problem: 'empty' };
  }
  const says = nameSays(name);
  if (isPdf(head, says)) {
    return says === 'docx' ? { ok: false, problem: 'notWord' } : { ok: true, kind: 'pdf' };
  }
  if (says === 'pdf') {
    return { ok: false, problem: 'notPdf' };
  }
  if (startsWith(head, ZIP)) {
    // Un posible Word: la validación confirma que adentro hay un documento.
    return { ok: true, kind: 'docx' };
  }
  if (says === 'docx') {
    return { ok: false, problem: 'notWord' };
  }
  if (OTHER_BINARIES.some((signature) => startsWith(head, signature))) {
    return { ok: false, problem: 'unsupported' };
  }
  const text = decodeText(head, { partial: size > head.length });
  if (text === null) {
    return { ok: false, problem: 'unsupported' };
  }
  // Una página web (H-28): el tipo sale de lo que tiene adentro, no del nombre.
  if (isHtml(text)) {
    return { ok: true, kind: 'web' };
  }
  // Un archivo chico que solo tiene espacios y renglones vacíos está vacío.
  if (size <= head.length && text.trim() === '') {
    return { ok: false, problem: 'empty' };
  }
  if (says === 'md' || looksLikeMarkdown(text)) {
    return { ok: true, kind: 'md' };
  }
  return { ok: true, kind: 'text' };
}

// La extensión con que se guarda el original de cada tipo.
export function extensionFor(kind: MaterialKind): 'pdf' | 'docx' | 'md' | 'txt' | 'html' {
  return kind === 'text' ? 'txt' : kind === 'web' ? 'html' : kind;
}
