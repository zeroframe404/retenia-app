import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { recognize } from '../../src/ingest/ocr';
import { pdfPageImage } from '../../src/ingest/pdf';
import { SCANNED_PAGE } from '../../tools/datos-de-ejemplo/contenido.mjs';
import { ROOT } from '../../tools/lib/proceso.mjs';
import { similarity } from '../apoyo/parecido';

// El reconocimiento de escaneos del proceso de trabajo de materiales (tesseract.js con los datos
// de español e inglés que vienen con Retenia), con la red bloqueada también en sus hilos.

const workDir = mkdtempSync(join(tmpdir(), 'retenia-escaneo-'));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

const EXPECTED = [SCANNED_PAGE.title, SCANNED_PAGE.subtitle, ...SCANNED_PAGE.paragraphs].join(' ');

describe('reconocimiento de escaneos', () => {
  it('[CA-029] reconoce la página 9 del PDF de ejemplo sin internet y el texto se parece al esperado en un 90 % o más', async () => {
    const pdf = new Uint8Array(
      readFileSync(join(ROOT, 'datos-de-ejemplo', 'Inferencia — capítulos 1 a 4.pdf')),
    );
    const image = await pdfPageImage(pdf, 9);
    if (!image) {
      throw new Error('La página 9 del PDF de ejemplo no trae la imagen del escaneo.');
    }
    const text = await recognize(image, { workDir });
    expect(similarity(text, EXPECTED), text).toBeGreaterThanOrEqual(0.9);
    // Las palabras con tilde de español salen bien: los datos de español están cargados.
    expect(text).toContain('hipótesis nula');
    expect(text).toContain('significación');
    // Usó solo los datos de idioma que vienen con Retenia, copiados a su carpeta de trabajo.
    expect(readdirSync(join(workDir, 'idiomas')).sort()).toEqual([
      'eng.traineddata.gz',
      'spa.traineddata.gz',
    ]);
  });

  it('[CA-029] un idioma que quedó copiado a medias (un corte, el disco lleno) se vuelve a copiar', async () => {
    const own = mkdtempSync(join(tmpdir(), 'retenia-escaneo-cortado-'));
    try {
      mkdirSync(join(own, 'idiomas'), { recursive: true });
      writeFileSync(join(own, 'idiomas', 'spa.traineddata.gz'), Buffer.alloc(1000, 7));
      const pdf = new Uint8Array(
        readFileSync(join(ROOT, 'datos-de-ejemplo', 'Inferencia — capítulos 1 a 4.pdf')),
      );
      const image = await pdfPageImage(pdf, 9);
      if (!image) {
        throw new Error('La página 9 del PDF de ejemplo no trae la imagen del escaneo.');
      }
      const text = await recognize(image, { workDir: own });
      expect(text).toContain('hipótesis nula');
      expect(statSync(join(own, 'idiomas', 'spa.traineddata.gz')).size).toBeGreaterThan(1_000_000);
    } finally {
      rmSync(own, { recursive: true, force: true });
    }
  });
});
