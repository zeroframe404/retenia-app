import { readFile } from 'node:fs/promises';
import { recognize } from '../../ingest/ocr';
import { pdfPageImage, readPdfPage } from '../../ingest/pdf';
import { materialsTask } from './protocol';

// Lo que hace el proceso de trabajo de materiales con cada pedido: leer el texto de una página
// de un PDF con sus posiciones, o reconocer una página escaneada.
export async function runMaterialsTask(raw: unknown): Promise<unknown> {
  const task = materialsTask.parse(raw);
  const data = new Uint8Array(await readFile(task.file));
  if (task.kind === 'readPdfPage') {
    return readPdfPage(data, task.page);
  }
  const image = await pdfPageImage(data, task.page);
  return { text: image ? await recognize(image, { workDir: task.workDir }) : '' };
}
