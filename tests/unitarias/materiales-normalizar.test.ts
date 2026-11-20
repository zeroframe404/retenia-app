import { describe, expect, it } from 'vitest';
import {
  type BlockDraft,
  normalizeDocument,
  revertText,
  toRawRange,
} from '../../src/core/materials/normalize';

// La normalización reversible (H-25): el texto que se lee por secciones se arregla un poco
// (palabras cortadas por guion, párrafos partidos entre páginas, forma Unicode NFC), pero cada
// arreglo queda anotado y se puede deshacer hasta volver al texto crudo.

const box = (page: number, y: number) => ({ page, x: 70, y, width: 400, height: 14 });

const paragraph = (page: number, lines: string[], y = 100): BlockDraft => ({
  type: 'paragraph',
  level: 0,
  unit: page,
  lines: lines.map((text, index) => ({ text, box: box(page, y + index * 16) })),
});

describe('palabras cortadas por guion', () => {
  it('se unen solo si la palabra unida aparece en el propio documento', () => {
    const [first] = normalizeDocument([
      paragraph(1, ['La estadística trabaja con informa-', 'ción incompleta.']),
      paragraph(1, ['Esa información se llama dato.'], 300),
    ]);
    expect(first?.normalized).toBe('La estadística trabaja con información incompleta.');
    expect(first?.transformations.map((t) => t.kind)).toEqual(['hyphen']);
  });

  it('si la palabra unida no aparece en otro lado, el guion queda (puede ser una palabra compuesta)', () => {
    const [first] = normalizeDocument([
      paragraph(1, ['Un caso teórico-', 'práctico de muestreo.']),
    ]);
    expect(first?.normalized).toBe('Un caso teórico- práctico de muestreo.');
    expect(first?.transformations.map((t) => t.kind)).toEqual(['linebreak']);
  });

  it('la palabra se busca sin distinguir mayúsculas', () => {
    const [first] = normalizeDocument([
      paragraph(1, ['Hay que mirar la Pobla-', 'ción entera.']),
      paragraph(1, ['La población es grande.'], 300),
    ]);
    expect(first?.normalized).toBe('Hay que mirar la Población entera.');
  });
});

describe('párrafos partidos entre páginas', () => {
  it('se unen si la línea no termina en puntuación final y la siguiente empieza en minúscula', () => {
    const blocks = normalizeDocument([
      paragraph(1, ['El tamaño de la muestra también', 'importa cuando']),
      { type: 'footer', level: 0, unit: 1, lines: [{ text: '1', box: box(1, 800) }] },
      { type: 'header', level: 0, unit: 2, lines: [{ text: 'Inferencia', box: box(2, 20) }] },
      paragraph(2, ['hay pocos casos.']),
    ]);
    const joined = blocks.filter((block) => block.type === 'paragraph');
    expect(joined).toHaveLength(1);
    expect(joined[0]?.normalized).toBe(
      'El tamaño de la muestra también importa cuando hay pocos casos.',
    );
    // El bloque recuerda sus dos páginas.
    expect(joined[0]?.lines.map((line) => line.box?.page)).toEqual([1, 1, 2]);
    expect(joined[0]?.unit).toBe(1);
  });

  it('no se unen si la línea termina en punto, o si la siguiente empieza en mayúscula', () => {
    const ended = normalizeDocument([paragraph(1, ['Termina acá.']), paragraph(2, ['seguimos.'])]);
    expect(ended.filter((block) => block.type === 'paragraph')).toHaveLength(2);
    const capital = normalizeDocument([
      paragraph(1, ['No termina']),
      paragraph(2, ['Pero sigue.']),
    ]);
    expect(capital.filter((block) => block.type === 'paragraph')).toHaveLength(2);
  });

  it('dentro de la misma página dos párrafos nunca se unen', () => {
    const same = normalizeDocument([paragraph(1, ['No termina']), paragraph(1, ['sigue'], 300)]);
    expect(same.filter((block) => block.type === 'paragraph')).toHaveLength(2);
  });
});

describe('forma Unicode y reversibilidad', () => {
  it('el texto queda en NFC y el cambio se anota', () => {
    const [first] = normalizeDocument([paragraph(1, ['México'])]);
    expect(first?.normalized).toBe('México');
    expect(first?.transformations.map((t) => t.kind)).toEqual(['nfc']);
  });

  it('deshacer las transformaciones da el texto crudo, y una selección vuelve a su lugar crudo', () => {
    const blocks = normalizeDocument([
      paragraph(1, ['La estadística trabaja con informa-', 'ción incompleta y México.']),
      paragraph(1, ['La información.'], 300),
    ]);
    const first = blocks[0];
    if (!first) {
      throw new Error('falta el bloque');
    }
    expect(revertText(first.normalized, first.transformations)).toBe(first.raw);
    expect(first.raw).toBe('La estadística trabaja con informa-\nción incompleta y México.');
    const start = first.normalized.indexOf('información');
    const range = toRawRange([start, start + 'información'.length], first.transformations);
    expect(first.raw.slice(range[0], range[1])).toBe('informa-\nción');
  });
});

describe('el árbol de secciones', () => {
  const heading = (page: number, level: number, text: string): BlockDraft => ({
    type: 'section',
    level,
    unit: page,
    lines: [{ text, box: box(page, 60) }],
  });

  it('cada bloque cuelga de la última sección de nivel menor y lleva su ruta de títulos', () => {
    const blocks = normalizeDocument([
      heading(1, 1, 'Capítulo 1'),
      heading(1, 2, '1.1 Población'),
      paragraph(1, ['Texto.'], 200),
      heading(2, 1, 'Capítulo 2'),
      paragraph(2, ['Más.'], 200),
    ]);
    const byText = (text: string) => blocks.find((block) => block.normalized === text);
    expect(byText('Texto.')?.headingPath).toEqual(['Capítulo 1', '1.1 Población']);
    expect(byText('Más.')?.headingPath).toEqual(['Capítulo 2']);
    const chapter = blocks.indexOf(byText('Capítulo 1') as (typeof blocks)[number]);
    expect(byText('1.1 Población')?.parent).toBe(chapter);
    expect(byText('Capítulo 2')?.parent).toBeNull();
  });
});
