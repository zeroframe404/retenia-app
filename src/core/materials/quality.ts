import type { BlockType } from './blocks';

// Las señales de calidad de un material (H-27): avisos de que una parte se puede haber leído mal.
// Nunca son un veredicto: la pantalla las muestra como «posible» y es la persona quien decide.

export type SignalKind =
  | 'lowCoverage'
  | 'anomalousChars'
  | 'possibleTable'
  | 'possibleFormula'
  | 'lowConfidence';

export type TextLayer = 'ok' | 'sparse' | 'none';

// Menos de esto en una hoja entera es «muy poca capa de texto»: un escaneo con un sello o un
// número de página suelto. Se mide en caracteres por cada 10.000 puntos cuadrados de hoja.
const SPARSE_BELOW_DENSITY = 3;
// Con menos caracteres que esto, la página no tiene texto que valga, sea cual sea su tamaño.
const SPARSE_BELOW_CHARS = 40;
// Una página con texto pero por debajo de esta densidad avisa «cobertura baja».
const LOW_COVERAGE_DENSITY = 8;
// Una confianza de reconocimiento (0 a 100) por debajo de esto es dudosa.
export const OCR_DOUBT_BELOW = 75;
// La parte de los caracteres que pueden ser raros antes de avisar.
const ANOMALOUS_FROM = 0.02;

const density = (chars: number, width: number, height: number) =>
  (chars / (width * height)) * 10_000;

interface PageSize {
  chars: number;
  width: number | null;
  height: number | null;
}

// Cuánta capa de texto tiene una página de PDF: ninguna, muy poca para su tamaño, o la que hace
// falta. Sin el tamaño de la hoja solo se sabe si hay o no texto.
export function textLayer({ chars, width, height }: PageSize): TextLayer {
  if (chars <= 0) {
    return 'none';
  }
  if (chars < SPARSE_BELOW_CHARS) {
    return 'sparse';
  }
  if (width === null || height === null || width <= 0 || height <= 0) {
    return 'ok';
  }
  return density(chars, width, height) < SPARSE_BELOW_DENSITY ? 'sparse' : 'ok';
}

// Caracteres que casi seguro son un error de lectura: el de reemplazo, los de control (menos el
// tabulador y los saltos) y los del área privada.
function isAnomalous(code: number): boolean {
  return (
    code === 0xfffd ||
    (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0xe000 && code <= 0xf8ff)
  );
}

// La parte del texto (de 0 a 1) que son caracteres anómalos.
export function anomalousRatio(text: string): number {
  let total = 0;
  let strange = 0;
  for (const char of text) {
    total++;
    if (isAnomalous(char.codePointAt(0) ?? 0)) {
      strange++;
    }
  }
  return total === 0 ? 0 : strange / total;
}

const NUMBER = /^[-−+]?\d+(?:[.,]\d+)?%?$/u;
const MATH_SYMBOLS = /[∑Σ∫√±≤≥≈≠∞×÷∂∇→⁰¹²³⁴⁵⁶⁷⁸⁹ᵢⱼₙₖ]|̄|̅/gu;

// Tres renglones o más con tres cifras cada uno: columnas alineadas.
function looksLikeColumns(text: string): boolean {
  const rows = text
    .split('\n')
    .filter((line) => line.split(/\s+/u).filter((token) => NUMBER.test(token)).length >= 3);
  return rows.length >= 3;
}

function hasMathSymbols(text: string): boolean {
  return (text.match(MATH_SYMBOLS)?.length ?? 0) >= 3;
}

export function blockSignals({
  type,
  text,
  ocrConfidence = null,
}: {
  type: BlockType;
  text: string;
  ocrConfidence?: number | null;
}): SignalKind[] {
  const signals: SignalKind[] = [];
  const prose = type === 'paragraph' || type === 'table' || type === 'formula' || type === 'code';
  if (type === 'table' || (type === 'paragraph' && looksLikeColumns(text))) {
    signals.push('possibleTable');
  }
  if (type === 'formula' || (prose && type !== 'table' && hasMathSymbols(text))) {
    signals.push('possibleFormula');
  }
  if (anomalousRatio(text) >= ANOMALOUS_FROM) {
    signals.push('anomalousChars');
  }
  if (ocrConfidence !== null && ocrConfidence < OCR_DOUBT_BELOW && text.trim() !== '') {
    signals.push('lowConfidence');
  }
  return signals;
}

// Las señales de la página entera: poco texto para su tamaño (sin llegar a «No extraído») y un
// reconocimiento dudoso.
export function unitSignals({
  chars,
  width,
  height,
  ocrConfidence = null,
}: PageSize & { ocrConfidence?: number | null }): SignalKind[] {
  const signals: SignalKind[] = [];
  if (
    textLayer({ chars, width, height }) === 'ok' &&
    width !== null &&
    height !== null &&
    width > 0 &&
    height > 0 &&
    density(chars, width, height) < LOW_COVERAGE_DENSITY
  ) {
    signals.push('lowCoverage');
  }
  if (ocrConfidence !== null && ocrConfidence < OCR_DOUBT_BELOW) {
    signals.push('lowConfidence');
  }
  return signals;
}
