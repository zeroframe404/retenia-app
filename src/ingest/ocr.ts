// Reconocer el texto de una página escaneada (tesseract.js, en los hilos de trabajo del proceso
// de materiales) sin internet: los datos de español e inglés vienen con Retenia
// (@tesseract.js-data, la versión entera comprimida que usa tesseract.js por defecto) y se copian
// una vez a la carpeta de trabajo, que es de donde tesseract.js los lee. Nunca se le deja pedir
// nada a la red: la carpeta de idiomas es local y no se usa su caché.
import { copyFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
// tesseract.js es CommonJS: dentro del programa empaquetado sus nombres sueltos no llegan, así que
// se usa el módulo entero.
import Tesseract from 'tesseract.js';
import type { GrayImage } from './pdf';

const require = createRequire(import.meta.url);
const LANGUAGES = ['spa', 'eng'] as const;

function packagedData(language: string): string {
  const folder = dirname(require.resolve(`@tesseract.js-data/${language}/package.json`));
  return join(folder, '4.0.0_best_int', `${language}.traineddata.gz`);
}

// La imagen en formato PGM (grises, sin comprimir), que tesseract.js lee sin ayuda.
function toPgm(image: GrayImage): Uint8Array {
  const header = new TextEncoder().encode(`P5\n${image.width} ${image.height}\n255\n`);
  const file = new Uint8Array(header.length + image.pixels.length);
  file.set(header, 0);
  file.set(image.pixels, header.length);
  return file;
}

async function createWorker(workDir: string) {
  const languages = join(workDir, 'idiomas');
  mkdirSync(languages, { recursive: true });
  // Se copia a un archivo aparte y se renombra al final; uno que quedó a medias (un corte, el
  // disco lleno) no tiene el tamaño del original y se vuelve a copiar.
  for (const language of LANGUAGES) {
    const source = packagedData(language);
    const target = join(languages, `${language}.traineddata.gz`);
    if (statSync(target, { throwIfNoEntry: false })?.size !== statSync(source).size) {
      copyFileSync(source, `${target}.parcial`);
      renameSync(`${target}.parcial`, target);
    }
  }
  return Tesseract.createWorker([...LANGUAGES], Tesseract.OEM.LSTM_ONLY, {
    langPath: languages,
    cacheMethod: 'none',
    gzip: true,
  });
}

export async function recognize(
  image: GrayImage,
  { workDir }: { workDir: string },
): Promise<string> {
  const worker = await createWorker(workDir);
  try {
    const { data } = await worker.recognize(Buffer.from(toPgm(image)));
    return data.text.trim();
  } finally {
    await worker.terminate();
  }
}

interface RecognizedLine {
  text: string;
  // De 0 a 100.
  confidence: number;
  // En puntos de la imagen.
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  // La altura de la letra, que sirve para distinguir un título del texto.
  rowHeight: number;
}

export interface Recognized {
  text: string;
  confidence: number;
  lines: RecognizedLine[];
}

// Lo mismo, con cada renglón, su caja y su confianza (la lectura de materiales, Fase 14).
export async function recognizeLines(
  image: GrayImage,
  { workDir }: { workDir: string },
): Promise<Recognized> {
  const worker = await createWorker(workDir);
  try {
    const { data } = await worker.recognize(
      Buffer.from(toPgm(image)),
      {},
      { text: true, blocks: true },
    );
    const lines: RecognizedLine[] = [];
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          const text = line.text.replace(/\s+/gu, ' ').trim();
          if (text !== '') {
            lines.push({
              text,
              confidence: line.confidence,
              x0: line.bbox.x0,
              y0: line.bbox.y0,
              x1: line.bbox.x1,
              y1: line.bbox.y1,
              rowHeight: line.rowAttributes?.rowHeight ?? line.bbox.y1 - line.bbox.y0,
            });
          }
        }
      }
    }
    return { text: data.text.trim(), confidence: data.confidence, lines };
  } finally {
    await worker.terminate();
  }
}
