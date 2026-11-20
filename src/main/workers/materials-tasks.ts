import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { blocksFromDocx } from '../../core/materials/docx-tree';
import { normalizeDocument } from '../../core/materials/normalize';
import { structurePdf } from '../../core/materials/structure';
import { decodeText, readMarkdown, readPlainText } from '../../core/materials/text';
import { MAX_WEB_BYTES } from '../../core/materials/web-address';
import { checkDocx, readDocx } from '../../ingest/docx';
import {
  extractPdfPage,
  type OpenPdf,
  openPdf,
  PdfUnreadableError,
  pdfInfo,
  pdfPageImage,
  readPdfPage,
} from '../../ingest/pdf';
import { materialsTask } from './protocol';

// Lo que hace el proceso de trabajo de materiales con cada pedido: las piezas del Laboratorio
// (leer una página con sus posiciones, reconocer un escaneo) y las etapas de la cadena de los
// materiales (validar, extraer, estructura y normalización). Lee el original de `originales\` en
// modo lectura y nunca toca la base: devuelve resultados que el principal valida y guarda.

// El PDF del material en curso queda abierto mientras se leen sus páginas.
let open: { file: string; pdf: Promise<OpenPdf> } | null = null;

async function pdfOf(file: string): Promise<OpenPdf> {
  if (open?.file !== file) {
    const previous = open;
    open = { file, pdf: readFile(file).then((data) => openPdf(new Uint8Array(data))) };
    void previous?.pdf.then((pdf) => pdf.close()).catch(() => undefined);
  }
  try {
    return await open.pdf;
  } catch (error) {
    open = null;
    throw error;
  }
}

// Reconocer una página escaneada (Fase 14): se dibuja su imagen más grande, tesseract.js lee cada
// renglón con su caja y todo vuelve con la forma de una página de PDF con texto, así la cadena de
// después (estructura, normalización, bloques) es la misma. La confianza viaja aparte.
async function ocrExtraction(file: string, unit: number, workDir: string) {
  const data = new Uint8Array(await readFile(file));
  const layer = await extractPdfPage(await pdfOf(file), unit);
  const image = await pdfPageImage(data, unit);
  const { recognizeLines } = await import('../../ingest/ocr');
  const recognized = image
    ? await recognizeLines(image, { workDir })
    : { text: '', confidence: 0, lines: [] };
  const box = layer.images.reduce<{ x: number; y: number; width: number; height: number } | null>(
    (largest, candidate) =>
      !largest || candidate.width * candidate.height > largest.width * largest.height
        ? candidate
        : largest,
    null,
  ) ?? { x: 0, y: 0, width: layer.width, height: layer.height };
  const scaleX = image ? box.width / image.width : 1;
  const scaleY = image ? box.height / image.height : 1;
  const items = recognized.lines.map((line) => ({
    text: line.text,
    x: box.x + line.x0 * scaleX,
    y: box.y + line.y0 * scaleY,
    width: Math.max(1, (line.x1 - line.x0) * scaleX),
    height: Math.max(1, (line.y1 - line.y0) * scaleY),
    size: Math.max(1, Math.round(line.rowHeight * scaleY)),
    bold: false,
    fontFamily: '',
    fontName: '',
  }));
  return {
    format: 'pdf' as const,
    page: {
      page: unit,
      width: layer.width,
      height: layer.height,
      items,
      images: [],
      ocr: { confidence: Math.max(0, Math.min(100, recognized.confidence)) },
    },
    tool: { text: recognized.text, confidence: recognized.confidence, lines: recognized.lines },
  };
}

// Una página web guardada (Fase 14): el contenido principal, saneado, con sus bloques.
async function readWeb(file: string) {
  const bytes = new Uint8Array(await readFile(file));
  const html = decodeText(bytes);
  if (html === null) {
    throw new Error('La página dejó de ser legible');
  }
  const { snapshotWeb } = await import('../../ingest/web');
  const snapshot = snapshotWeb(html);
  if (!snapshot) {
    return { format: 'web' as const, unreadable: 'webEmpty' as const };
  }
  return {
    format: 'web' as const,
    drafts: snapshot.drafts,
    snapshot: { title: snapshot.title, html: snapshot.html },
    tool: { title: snapshot.title },
  };
}

async function readFlow(format: 'docx' | 'md' | 'text', file: string) {
  const data = await readFile(file);
  if (format === 'docx') {
    const { tree, messages } = await readDocx(data);
    return { drafts: blocksFromDocx(tree), tool: { tree, messages } };
  }
  const text = decodeText(new Uint8Array(data));
  if (text === null) {
    throw new Error('El texto dejó de ser legible');
  }
  return { drafts: format === 'md' ? readMarkdown(text) : readPlainText(text), tool: { text } };
}

export async function runMaterialsTask(raw: unknown): Promise<unknown> {
  const task = materialsTask.parse(raw);
  switch (task.kind) {
    case 'readPdfPage':
      return readPdfPage(new Uint8Array(await readFile(task.file)), task.page);
    case 'ocrPdfPage': {
      const image = await pdfPageImage(new Uint8Array(await readFile(task.file)), task.page);
      // El reconocimiento de escaneos (tesseract.js) se carga recién acá.
      const { recognize } = await import('../../ingest/ocr');
      return { text: image ? await recognize(image, { workDir: task.workDir }) : '' };
    }
    case 'validate': {
      if (task.format === 'pdf') {
        try {
          const info = await pdfInfo(await pdfOf(task.file));
          return { units: info.pages, outline: info.outline };
        } catch (error) {
          if (error instanceof PdfUnreadableError) {
            return { unreadable: 'pdfUnreadable' };
          }
          throw error;
        }
      }
      if (task.format === 'docx') {
        const check = await checkDocx(await readFile(task.file));
        if (check !== 'ok') {
          return {
            unreadable:
              check === 'notWord' && !task.declaredWord ? 'unsupported' : 'wordUnreadable',
          };
        }
        return { units: [{ unit: 1, width: null, height: null }], outline: [] };
      }
      const bytes = new Uint8Array(await readFile(task.file));
      if (task.format === 'web' && bytes.length > MAX_WEB_BYTES) {
        return { unreadable: 'tooLarge' };
      }
      const text = decodeText(bytes);
      return text === null
        ? { unreadable: 'textUnreadable' }
        : { units: [{ unit: 1, width: null, height: null }], outline: [] };
    }
    case 'extract': {
      if (task.format === 'pdf') {
        if (task.ocr) {
          return ocrExtraction(task.file, task.unit, task.workDir ?? tmpdir());
        }
        const extraction = await extractPdfPage(await pdfOf(task.file), task.unit);
        const { tool, ...page } = extraction;
        return { format: 'pdf', page: { page: task.unit, ...page }, tool };
      }
      if (task.format === 'web') {
        return readWeb(task.file);
      }
      return { format: task.format, ...(await readFlow(task.format, task.file)) };
    }
    case 'structure':
      return {
        drafts: task.format === 'pdf' ? structurePdf(task.pages, task.outline) : task.drafts,
      };
    case 'normalize':
      return { blocks: normalizeDocument(task.drafts) };
  }
}
