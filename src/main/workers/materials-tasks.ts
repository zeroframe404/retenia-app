import { readFile } from 'node:fs/promises';
import { blocksFromDocx } from '../../core/materials/docx-tree';
import { normalizeDocument } from '../../core/materials/normalize';
import { structurePdf } from '../../core/materials/structure';
import { decodeText, readMarkdown, readPlainText } from '../../core/materials/text';
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
      // El reconocimiento de escaneos (tesseract.js) se carga recién acá: la versión real todavía no
      // lo trae (llega con la Fase 14) y el proceso igual tiene que poder abrir.
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
      const text = decodeText(new Uint8Array(await readFile(task.file)));
      return text === null
        ? { unreadable: 'textUnreadable' }
        : { units: [{ unit: 1, width: null, height: null }], outline: [] };
    }
    case 'extract': {
      if (task.format === 'pdf') {
        const extraction = await extractPdfPage(await pdfOf(task.file), task.unit);
        const { tool, ...page } = extraction;
        return { format: 'pdf', page: { page: task.unit, ...page }, tool };
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
