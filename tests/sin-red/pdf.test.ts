import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { locatePhrase } from '../../src/core/highlight';
import { PDF_OPTIONS, pdfPageImage, readPdfPage } from '../../src/ingest/pdf';
import { HIGHLIGHT_PHRASE } from '../../tools/datos-de-ejemplo/contenido.mjs';
import { ROOT } from '../../tools/lib/proceso.mjs';

// La lectura de PDF del proceso de trabajo de materiales (pdf.js, compilación para Node), con la
// red bloqueada, sobre el PDF de ejemplo del elenco.

const sample = (name: string) => new Uint8Array(readFileSync(join(ROOT, 'datos-de-ejemplo', name)));
const INFERENCE = 'Inferencia — capítulos 1 a 4.pdf';

describe('lectura de PDF', () => {
  it('[CA-028] extrae el texto de la página 1 del PDF de ejemplo con la posición de cada renglón dentro de la hoja', async () => {
    const page = await readPdfPage(sample(INFERENCE), 1);
    expect(page.pageCount).toBe(12);
    // A4 en puntos.
    expect(page.width).toBeCloseTo(595.3, 0);
    expect(page.height).toBeCloseTo(841.9, 0);
    const lines = page.items.map((item) => item.text);
    expect(lines).toContain('Capítulo 1 · Población, muestra y estimadores');
    expect(lines).toContain('1.1 Población y muestra');
    expect(lines.join(' ')).toContain(HIGHLIGHT_PHRASE);
    for (const item of page.items) {
      expect(item.text.trim()).not.toBe('');
      expect(item.width).toBeGreaterThan(0);
      expect(item.height).toBeGreaterThan(0);
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.y).toBeGreaterThanOrEqual(0);
      expect(item.x + item.width).toBeLessThanOrEqual(page.width);
      expect(item.y + item.height).toBeLessThanOrEqual(page.height);
    }
    // Los renglones vienen en orden de lectura: de arriba hacia abajo.
    const tops = page.items.map((item) => item.y);
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    // El título del capítulo está arriba de todo y en letra más grande que el texto.
    const title = page.items.find((i) => i.text.startsWith('Capítulo 1'));
    const body = page.items.find((i) => i.text.startsWith('La estadística trabaja'));
    expect(title && body && title.y < body.y && title.height > body.height).toBe(true);
  });

  it('[CA-028] ubica la frase a resaltar sobre sus dos renglones de la página 1', async () => {
    const page = await readPdfPage(sample(INFERENCE), 1);
    const rects = locatePhrase(page.items, HIGHLIGHT_PHRASE);
    expect(rects).toHaveLength(2);
    const [first, second] = rects ?? [];
    const firstLine = page.items.find((i) => i.text.startsWith('Una muestra es una parte'));
    expect(first).toEqual({
      x: firstLine?.x,
      y: firstLine?.y,
      width: firstLine?.width,
      height: firstLine?.height,
    });
    expect(second && first && second.y > first.y).toBe(true);
  });

  it('[CA-029] la página 9 no tiene capa de texto: es la imagen de un escaneo', async () => {
    const page = await readPdfPage(sample(INFERENCE), 9);
    expect(page.items).toEqual([]);
    const image = await pdfPageImage(sample(INFERENCE), 9);
    expect(image?.width).toBe(1654);
    expect(image?.height).toBe(2339);
    expect(image?.pixels.length).toBe(1654 * 2339);
  });

  it('la tabla de la página 7 y la fórmula de la página 11 salen tal como las deja el PDF', async () => {
    const table = await readPdfPage(sample(INFERENCE), 7);
    const tableText = table.items.map((i) => i.text).join(' ');
    expect(tableText).toContain('Grados de libertad');
    expect(tableText).toContain('12,706');
    const formula = await readPdfPage(sample(INFERENCE), 11);
    const formulaText = formula.items.map((i) => i.text).join(' ');
    expect(formulaText).toContain('t =');
    expect(formulaText).toContain('s / √n');
  });

  it('una página con texto no tiene imagen de escaneo', async () => {
    expect(await pdfPageImage(sample(INFERENCE), 1)).toBeNull();
  });

  it('el PDF se abre sin ejecutar nada de lo que trae adentro', () => {
    expect(PDF_OPTIONS.isEvalSupported).toBe(false);
    expect(PDF_OPTIONS.enableXfa).toBe(false);
  });

  it('un archivo que no es un PDF se rechaza sin colgarse', async () => {
    await expect(readPdfPage(sample('no-es-un-pdf.pdf'), 1)).rejects.toThrow();
  });

  it('una página que no existe se rechaza', async () => {
    await expect(readPdfPage(sample(INFERENCE), 13)).rejects.toThrow();
  });
});
