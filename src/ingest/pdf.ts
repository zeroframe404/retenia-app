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
