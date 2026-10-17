// Reconocer el texto de una página escaneada (tesseract.js, en los hilos de trabajo del proceso
// de materiales) sin internet: los datos de español e inglés vienen con Retenia
// (@tesseract.js-data, la versión entera comprimida que usa tesseract.js por defecto) y se copian
// una vez a la carpeta de trabajo, que es de donde tesseract.js los lee. Nunca se le deja pedir
// nada a la red: la carpeta de idiomas es local y no se usa su caché.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
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

export async function recognize(
  image: GrayImage,
  { workDir }: { workDir: string },
): Promise<string> {
  const languages = join(workDir, 'idiomas');
  mkdirSync(languages, { recursive: true });
  for (const language of LANGUAGES) {
    const target = join(languages, `${language}.traineddata.gz`);
    if (!existsSync(target)) {
      copyFileSync(packagedData(language), target);
    }
  }
  const worker = await Tesseract.createWorker([...LANGUAGES], Tesseract.OEM.LSTM_ONLY, {
    langPath: languages,
    cacheMethod: 'none',
    gzip: true,
  });
  try {
    const { data } = await worker.recognize(toPgm(image));
    return data.text.trim();
  } finally {
    await worker.terminate();
  }
}
