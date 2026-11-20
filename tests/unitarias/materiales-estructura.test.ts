import { describe, expect, it } from 'vitest';
import { blocksFromDocx, type DocxNode } from '../../src/core/materials/docx-tree';
import {
  type PdfPageExtract,
  type PdfTextItem,
  structurePdf,
} from '../../src/core/materials/structure';
import { readMarkdown, readPlainText } from '../../src/core/materials/text';

// El análisis de estructura (H-25, CA-104 y CA-107): de lo que extrae cada lector salen bloques
// con su tipo (sección, título, párrafo, lista, tabla, fórmula, figura, código, encabezado y pie
// de página). Nada se inventa: un bloque siempre es texto que estaba en el material.

const A4 = { width: 595, height: 842 };

const item = (
  text: string,
  y: number,
  { size = 11, bold = false, x = 68, family = 'sans-serif', font = 'Arial' } = {},
): PdfTextItem => ({
  text,
  x,
  y,
  width: Math.min(460, text.length * size * 0.5),
  height: size * 1.15,
  size,
  bold,
  fontFamily: family,
  fontName: bold ? `${font}-Bold` : font,
});

const page = (number: number, items: PdfTextItem[], images: PdfPageExtract['images'] = []) => ({
  page: number,
  ...A4,
  items,
  images,
});

const types = (blocks: { type: string; lines: { text: string }[] }[]) =>
  blocks.map((block) => `${block.type}: ${block.lines.map((line) => line.text).join(' / ')}`);

describe('títulos y párrafos en un PDF', () => {
  it('los títulos salen del tamaño de letra relativo al cuerpo y los renglones seguidos forman un párrafo', () => {
    const blocks = structurePdf(
      [
        page(1, [
          item('Capítulo 1 · Población', 80, { size: 17, bold: true }),
          item('1.1 Población y muestra', 120, { size: 13, bold: true }),
          item('La estadística trabaja casi siempre con información', 150),
          item('incompleta. Ese conjunto completo se llama población.', 166.5),
          item('Una muestra es una parte de la población.', 200),
          item('1', 800, { size: 9 }),
        ]),
        page(2, [
          item('1.2 Parámetros', 80, { size: 13, bold: true }),
          item('Un parámetro describe a la población entera.', 110),
          item('2', 800, { size: 9 }),
        ]),
      ],
      [],
    );
    expect(types(blocks)).toEqual([
      'section: Capítulo 1 · Población',
      'section: 1.1 Población y muestra',
      'paragraph: La estadística trabaja casi siempre con información / incompleta. Ese conjunto completo se llama población.',
      'paragraph: Una muestra es una parte de la población.',
      'footer: 1',
      'section: 1.2 Parámetros',
      'paragraph: Un parámetro describe a la población entera.',
      'footer: 2',
    ]);
    expect(blocks.filter((b) => b.type === 'section').map((b) => b.level)).toEqual([1, 2, 2]);
  });

  it('un renglón que se repite arriba de cada página es un encabezado', () => {
    const blocks = structurePdf(
      [1, 2, 3].map((n) =>
        page(n, [
          item('Inferencia · apuntes', 30, { size: 9 }),
          item(`Texto de la página ${n}.`, 100),
        ]),
      ),
      [],
    );
    expect(blocks.filter((b) => b.type === 'header')).toHaveLength(3);
  });

  it('una sección numerada que no corresponde al capítulo anterior queda a su nivel, sin título inventado', () => {
    const blocks = structurePdf(
      [
        page(1, [
          item('Capítulo 3 · Intervalos', 80, { size: 17, bold: true }),
          item('3.1 Un rango', 120, { size: 13, bold: true }),
          item('Texto del capítulo tres.', 150),
        ]),
        page(2, [
          item('4.2 Dos maneras de equivocarse', 80, { size: 13, bold: true }),
          item('Texto que viene de un capítulo que no se pudo leer.', 110),
        ]),
      ],
      [],
    );
    const sections = blocks.filter((b) => b.type === 'section');
    expect(sections.map((b) => [b.lines[0]?.text, b.level])).toEqual([
      ['Capítulo 3 · Intervalos', 1],
      ['3.1 Un rango', 2],
      ['4.2 Dos maneras de equivocarse', 1],
    ]);
  });

  it('con índice del documento, los niveles salen del índice', () => {
    const blocks = structurePdf(
      [
        page(1, [
          item('Primera parte', 80, { size: 13, bold: true }),
          item('Detalle', 120, { size: 13, bold: true }),
          item('Texto.', 150),
        ]),
      ],
      [
        { title: 'Primera parte', page: 1, level: 1 },
        { title: 'Detalle', page: 1, level: 2 },
      ],
    );
    expect(blocks.filter((b) => b.type === 'section').map((b) => b.level)).toEqual([1, 2]);
  });
});

describe('tablas, fórmulas, código y figuras en un PDF', () => {
  it('celdas alineadas en columnas durante dos filas o más forman una tabla', () => {
    const row = (y: number, cells: string[]) =>
      cells.map((text, index) => item(text, y, { x: 120 + index * 110 }));
    const blocks = structurePdf(
      [
        page(1, [
          item('Valores críticos de la distribución t.', 80),
          ...row(120, ['gl', '90 %', '95 %']),
          ...row(140, ['5', '2,015', '2,571']),
          ...row(160, ['10', '1,812', '2,228']),
          item('Después de la tabla sigue el texto.', 200),
        ]),
      ],
      [],
    );
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'table', 'paragraph']);
    expect(blocks[1]?.lines.map((line) => line.text)).toEqual([
      'gl\t90 %\t95 %',
      '5\t2,015\t2,571',
      '10\t1,812\t2,228',
    ]);
  });

  it('un renglón grande con signos matemáticos es una fórmula, no un título', () => {
    const blocks = structurePdf(
      [
        page(1, [
          item('El estadístico t se calcula así:', 80),
          item('t = x̄ − μ0 / s / √n', 120, { size: 20, family: 'serif', font: 'TimesNewRoman' }),
          item('Con eso se compara.', 170),
        ]),
      ],
      [],
    );
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'formula', 'paragraph']);
  });

  it('la letra de ancho fijo es código', () => {
    const blocks = structurePdf(
      [
        page(1, [
          item('Un ejemplo:', 80),
          item('media <- mean(datos)', 100, { family: 'monospace', font: 'CourierNew' }),
          item('sd(datos)', 115, { family: 'monospace', font: 'CourierNew' }),
        ]),
      ],
      [],
    );
    expect(types(blocks)).toEqual([
      'paragraph: Un ejemplo:',
      'code: media <- mean(datos) / sd(datos)',
    ]);
  });

  it('una imagen es una figura con su caja y sin texto; una página que es solo imagen no tiene texto', () => {
    const blocks = structurePdf([page(9, [], [{ x: 0, y: 0, width: 595, height: 842 }])], []);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'figure', unit: 9 });
    expect(blocks[0]?.lines).toEqual([
      { text: '', box: { page: 9, x: 0, y: 0, width: 595, height: 842 } },
    ]);
  });

  it('listas: renglones que empiezan con viñeta o número', () => {
    const blocks = structurePdf(
      [
        page(1, [
          item('Para la próxima clase:', 80),
          item('• Repasar el teorema.', 100, { x: 80 }),
          item('• Traer la calculadora.', 116, { x: 80 }),
        ]),
      ],
      [],
    );
    expect(types(blocks)).toEqual([
      'paragraph: Para la próxima clase:',
      'list: • Repasar el teorema. / • Traer la calculadora.',
    ]);
  });
});

describe('[CA-107] Markdown y texto: los títulos se vuelven secciones', () => {
  const NOTES = `# Notas de estadística

Notas sueltas de la cursada, para pasar en limpio.

## Medidas de centro

- La **media** es la suma de los datos dividida por la cantidad.
- La **mediana** deja el 50 % de los datos por debajo.

## Dispersión

El error estándar de la media es s / sqrt(n).

\`\`\`
media <- mean(datos)
\`\`\`

$$x = 1$$

| a | b |
|---|---|
| 1 | 2 |

> Una cita.

<script>alert(1)</script>
`;

  it('[CA-107] cada bloque con su tipo y su nivel; el HTML es texto común', () => {
    const blocks = readMarkdown(NOTES);
    expect(
      blocks.map((block) => [block.type, block.level, block.lines.map((l) => l.text)]),
    ).toEqual([
      ['section', 1, ['Notas de estadística']],
      ['paragraph', 0, ['Notas sueltas de la cursada, para pasar en limpio.']],
      ['section', 2, ['Medidas de centro']],
      [
        'list',
        0,
        [
          'La **media** es la suma de los datos dividida por la cantidad.',
          'La **mediana** deja el 50 % de los datos por debajo.',
        ],
      ],
      ['section', 2, ['Dispersión']],
      ['paragraph', 0, ['El error estándar de la media es s / sqrt(n).']],
      ['code', 0, ['media <- mean(datos)']],
      ['formula', 0, ['x = 1']],
      ['table', 0, ['a\tb', '1\t2']],
      ['paragraph', 0, ['Una cita.']],
      ['paragraph', 0, ['<script>alert(1)</script>']],
    ]);
    expect(blocks.every((block) => block.unit === 1)).toBe(true);
  });

  it('[CA-107] el texto pegado: párrafos por renglón en blanco; un renglón corto sin punto final es un título', () => {
    const blocks = readPlainText(
      'Intervalos de confianza\n\nEs un rango de valores plausibles\npara un parámetro.\n\nSe calcula como la estimación más y menos un margen.\n',
    );
    expect(blocks.map((block) => [block.type, block.lines.map((l) => l.text)])).toEqual([
      ['section', ['Intervalos de confianza']],
      ['paragraph', ['Es un rango de valores plausibles', 'para un parámetro.']],
      ['paragraph', ['Se calcula como la estimación más y menos un margen.']],
    ]);
  });

  it('[CA-107] tres párrafos sin títulos: tres párrafos, ninguna sección', () => {
    const blocks = readPlainText('Uno, el primero.\n\nDos, el segundo.\n\nTres, el tercero.');
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'paragraph', 'paragraph']);
  });
});

describe('[CA-107] Word: títulos por estilo', () => {
  const run = (value: string): DocxNode => ({ type: 'run', children: [{ type: 'text', value }] });
  const para = (text: string, style: { styleId?: string; styleName?: string } = {}): DocxNode => ({
    type: 'paragraph',
    ...style,
    children: [run(text)],
  });

  it('[CA-107] «Title» es el título del documento, «Heading N» una sección de nivel N; listas, tablas e imágenes', () => {
    const tree: DocxNode = {
      type: 'document',
      children: [
        para('Resumen: intervalos de confianza', { styleId: 'Title' }),
        para('Qué es un intervalo de confianza', { styleId: 'Heading1' }),
        para('Es un rango de valores plausibles.'),
        { ...para('Primer punto'), numbering: { level: '0', isOrdered: false } },
        { ...para('Segundo punto'), numbering: { level: '0', isOrdered: false } },
        para('Cómo se interpreta', { styleName: 'heading 2' }),
        {
          type: 'table',
          children: [
            {
              type: 'tableRow',
              children: [
                { type: 'tableCell', children: [para('gl')] },
                { type: 'tableCell', children: [para('95 %')] },
              ],
            },
          ],
        },
        { type: 'paragraph', children: [{ type: 'image', altText: 'Una campana' }] },
      ],
    };
    const blocks = blocksFromDocx(tree);
    expect(
      blocks.map((block) => [block.type, block.level, block.lines.map((l) => l.text)]),
    ).toEqual([
      ['title', 0, ['Resumen: intervalos de confianza']],
      ['section', 1, ['Qué es un intervalo de confianza']],
      ['paragraph', 0, ['Es un rango de valores plausibles.']],
      ['list', 0, ['Primer punto', 'Segundo punto']],
      ['section', 2, ['Cómo se interpreta']],
      ['table', 0, ['gl\t95 %']],
      ['figure', 0, ['Una campana']],
    ]);
  });
});
