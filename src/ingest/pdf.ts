// Leer un PDF sin ejecutar nada de lo que trae adentro (pdf.js, compilación para Node, dentro del
// proceso de trabajo de materiales): el texto de una página con la caja de cada renglón en la
// hoja, y la imagen de una página escaneada para reconocerla. Las cajas van en puntos, con el
// origen arriba a la izquierda, como las dibuja la ventana.
import { GlobalWorkerOptions, getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from '../core/highlight';

// Dentro del proceso de trabajo de Electron, pdf.js no se reconoce en Node y busca su hilo de
// trabajo como en un navegador: se le indica el suyo, que corre en este mismo proceso.
GlobalWorkerOptions.workerSrc = import.meta.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

// Nada de lo que trae el PDF se ejecuta: ni código (eval), ni formularios dinámicos (XFA), ni
// fuentes del sistema; tampoco se piden recursos aparte.
export const PDF_OPTIONS = {
  enableXfa: false,
  disableFontFace: true,
  useSystemFonts: false,
  isOffscreenCanvasSupported: false,
  isImageDecoderSupported: false,
  useWorkerFetch: false,
  disableAutoFetch: true,
  verbosity: 0,
} as const;

export interface PdfPageText {
  pageCount: number;
  width: number;
  height: number;
  items: TextItem[];
}

export interface GrayImage {
  width: number;
  height: number;
  // Un byte por punto, de 0 (negro) a 255 (blanco), fila por fila.
  pixels: Uint8Array;
}

type PdfDocument = Awaited<ReturnType<typeof getDocument>['promise']>;

async function withPage<T>(
  data: Uint8Array,
  pageNumber: number,
  work: (page: Awaited<ReturnType<PdfDocument['getPage']>>, pageCount: number) => Promise<T>,
): Promise<T> {
  // pdf.js se queda con el arreglo que recibe: va una copia.
  const loading = getDocument({ data: data.slice(), ...PDF_OPTIONS });
  try {
    const pdf = await loading.promise;
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new RangeError(`El PDF no tiene la página ${pageNumber}`);
    }
    return await work(await pdf.getPage(pageNumber), pdf.numPages);
  } finally {
    await loading.destroy();
  }
}

export function readPdfPage(data: Uint8Array, pageNumber: number): Promise<PdfPageText> {
  return withPage(data, pageNumber, async (page, pageCount) => {
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const item of content.items) {
      if (!('str' in item) || item.str.trim() === '' || item.width <= 0) {
        continue;
      }
      const [, , c = 0, d = 0, e = 0, f = 0] = item.transform as number[];
      const size = Math.hypot(c, d) || item.height;
      const style = content.styles[item.fontName];
      const ascent = style?.ascent || 0.8;
      const descent = style?.descent || -0.2;
      const [x = 0, baseline = 0] = viewport.convertToViewportPoint(e, f);
      const top = Math.max(0, baseline - size * ascent);
      const height = Math.min(viewport.height - top, size * (ascent - descent));
      items.push({
        text: item.str,
        x: Math.max(0, x),
        y: top,
        width: Math.min(item.width, viewport.width - Math.max(0, x)),
        height,
      });
    }
    return { pageCount, width: viewport.width, height: viewport.height, items };
  });
}

interface PdfImage {
  width: number;
  height: number;
  kind: number;
  data: Uint8Array | Uint8ClampedArray;
}

// Pasa una imagen de pdf.js (1 bit, RGB o RGBA) a grises.
function toGray(image: PdfImage): GrayImage {
  const { width, height, kind, data } = image;
  const pixels = new Uint8Array(width * height);
  if (kind === 1) {
    const rowBytes = Math.ceil(width / 8);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bit = ((data[y * rowBytes + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1;
        pixels[y * width + x] = bit ? 255 : 0;
      }
    }
    return { width, height, pixels };
  }
  const step = kind === 3 ? 4 : 3;
  for (let i = 0; i < pixels.length; i++) {
    const r = data[i * step] ?? 255;
    const g = data[i * step + 1] ?? 255;
    const b = data[i * step + 2] ?? 255;
    pixels[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return { width, height, pixels };
}

// --- Lo que usa la cadena de los materiales (Fase 13) ---------------------------------------

export const PDFJS_VERSION = '6.4.299';

export class PdfUnreadableError extends Error {
  constructor(reason: string) {
    super(`No se pudo leer el PDF: ${reason}`);
    this.name = 'PdfUnreadableError';
  }
}

export interface OpenPdf {
  pdf: PdfDocument;
  close: () => Promise<void>;
}

// Abre un PDF y lo deja abierto (el proceso de trabajo lo guarda mientras lee sus páginas). Un PDF
// con contraseña o que pdf.js no entiende no se puede leer.
export async function openPdf(data: Uint8Array): Promise<OpenPdf> {
  const loading = getDocument({ data: data.slice(), ...PDF_OPTIONS });
  try {
    const pdf = await loading.promise;
    return { pdf, close: () => loading.destroy() };
  } catch (error) {
    await loading.destroy().catch(() => undefined);
    const name = (error as { name?: string }).name ?? '';
    throw new PdfUnreadableError(name || 'el archivo no es un PDF válido');
  }
}

export interface PdfInfo {
  pages: { unit: number; width: number; height: number }[];
  outline: { title: string; page: number | null; level: number }[];
}

// Cuántas páginas tiene, de qué tamaño, y su índice (si lo trae).
export async function pdfInfo({ pdf }: OpenPdf): Promise<PdfInfo> {
  const pages: PdfInfo['pages'] = [];
  for (let unit = 1; unit <= pdf.numPages; unit++) {
    const page = await pdf.getPage(unit);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({ unit, width: viewport.width, height: viewport.height });
    page.cleanup();
  }
  const outline: PdfInfo['outline'] = [];
  const walk = async (items: Awaited<ReturnType<PdfDocument['getOutline']>>, level: number) => {
    for (const item of items ?? []) {
      let page: number | null = null;
      try {
        const destination =
          typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
        const reference = Array.isArray(destination) ? destination[0] : null;
        if (reference && typeof reference === 'object') {
          page =
            (await pdf.getPageIndex(reference as Parameters<PdfDocument['getPageIndex']>[0])) + 1;
        }
      } catch {
        page = null;
      }
      outline.push({ title: item.title, page, level });
      await walk(item.items, level + 1);
    }
  };
  try {
    await walk(await pdf.getOutline(), 1);
  } catch {
    // Sin índice legible: las secciones salen del tamaño de la letra.
  }
  return { pages, outline };
}

type Matrix = [number, number, number, number, number, number];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export interface PdfPageExtraction {
  width: number;
  height: number;
  items: {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    size: number;
    bold: boolean;
    fontFamily: string;
    fontName: string;
  }[];
  images: { x: number; y: number; width: number; height: number }[];
  // La salida de pdf.js tal cual (el texto con sus transformaciones y las letras), para guardarla.
  tool: unknown;
}

// El texto de una página con su caja, su letra y su tamaño, más las cajas de sus imágenes.
export async function extractPdfPage({ pdf }: OpenPdf, unit: number): Promise<PdfPageExtraction> {
  const page = await pdf.getPage(unit);
  try {
    const viewport = page.getViewport({ scale: 1 });
    // La lista de operaciones carga las letras (para saber su nombre) y dice dónde van las imágenes.
    const operators = await page.getOperatorList();
    const images: PdfPageExtraction['images'] = [];
    const stack: Matrix[] = [];
    let current: Matrix = [1, 0, 0, 1, 0, 0];
    const IMAGE_OPS = new Set([
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintImageMaskXObject,
    ]);
    operators.fnArray.forEach((fn, index) => {
      if (fn === OPS.save) {
        stack.push(current);
      } else if (fn === OPS.restore) {
        current = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      } else if (fn === OPS.transform) {
        const args = (operators.argsArray[index] ?? []) as number[];
        current = multiply(current, [
          args[0] ?? 1,
          args[1] ?? 0,
          args[2] ?? 0,
          args[3] ?? 1,
          args[4] ?? 0,
          args[5] ?? 0,
        ]);
      } else if (IMAGE_OPS.has(fn)) {
        const corners = [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ].map(([u = 0, v = 0]) =>
          viewport.convertToViewportPoint(
            current[0] * u + current[2] * v + current[4],
            current[1] * u + current[3] * v + current[5],
          ),
        );
        const xs = corners.map((point) => point[0] ?? 0);
        const ys = corners.map((point) => point[1] ?? 0);
        const left = Math.max(0, Math.min(...xs));
        const top = Math.max(0, Math.min(...ys));
        const right = Math.min(viewport.width, Math.max(...xs));
        const bottom = Math.min(viewport.height, Math.max(...ys));
        if (right > left && bottom > top) {
          images.push({ x: left, y: top, width: right - left, height: bottom - top });
        }
      }
    });
    const content = await page.getTextContent();
    const fontNames = new Map<string, string>();
    const fontOf = (id: string) => {
      if (!fontNames.has(id)) {
        let name = '';
        try {
          const font = page.commonObjs.has(id)
            ? (page.commonObjs.get(id) as { name?: string } | null)
            : null;
          name = font?.name ?? '';
        } catch {
          name = '';
        }
        fontNames.set(id, name);
      }
      return fontNames.get(id) ?? '';
    };
    const items: PdfPageExtraction['items'] = [];
    for (const item of content.items) {
      if (!('str' in item) || item.str === '' || item.width <= 0) {
        continue;
      }
      const [, , c = 0, d = 0, e = 0, f = 0] = item.transform as number[];
      const size = Math.hypot(c, d) || item.height;
      const style = content.styles[item.fontName];
      const ascent = style?.ascent || 0.8;
      const descent = style?.descent || -0.2;
      const [x = 0, baseline = 0] = viewport.convertToViewportPoint(e, f);
      const top = Math.max(0, baseline - size * ascent);
      const name = fontOf(item.fontName);
      items.push({
        text: item.str,
        x: Math.max(0, x),
        y: top,
        width: Math.min(item.width, viewport.width - Math.max(0, x)),
        height: Math.min(viewport.height - top, size * (ascent - descent)),
        size,
        bold: /bold|black|heavy|semibold|demi/i.test(name),
        fontFamily: style?.fontFamily ?? '',
        fontName: name,
      });
    }
    return {
      width: viewport.width,
      height: viewport.height,
      items,
      images,
      tool: { items: content.items, styles: content.styles },
    };
  } finally {
    page.cleanup();
  }
}

// La imagen más grande de la página (la de un escaneo ocupa la hoja entera), o null si la página
// no tiene imágenes.
export function pdfPageImage(data: Uint8Array, pageNumber: number): Promise<GrayImage | null> {
  return withPage(data, pageNumber, async (page) => {
    const operators = await page.getOperatorList();
    const ids = operators.fnArray
      .map((fn, index) =>
        fn === OPS.paintImageXObject ? (operators.argsArray[index]?.[0] as string) : null,
      )
      .filter((id): id is string => typeof id === 'string');
    let largest: PdfImage | null = null;
    for (const id of ids) {
      const store = id.startsWith('g_') ? page.commonObjs : page.objs;
      const image = await new Promise<PdfImage | null>((resolve) => {
        store.get(id, (value: unknown) => resolve((value as PdfImage | null) ?? null));
      });
      if (
        image?.data &&
        (!largest || image.width * image.height > largest.width * largest.height)
      ) {
        largest = image;
      }
    }
    return largest ? toGray(largest) : null;
  });
}
