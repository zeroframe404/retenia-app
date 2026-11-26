import { describe, expect, it } from 'vitest';
import { headingTags } from '../../src/core/materials/headings';

// Los títulos del visor (Fase 13, accesibilidad que encontró la Fase 19): cada sección de la página
// va como título de nivel 3 o 4 sin saltear niveles. Una página que empieza con un subtítulo (la
// página 2 de «Inferencia — capítulos 1 a 4.pdf» empieza con «1.2 Parámetros y estadísticos») lo
// muestra como nivel 3.

const section = (level: number) => ({ type: 'section', level });
const paragraph = { type: 'paragraph', level: 0 };

describe('los títulos del visor no saltean niveles', () => {
  it('un capítulo va como nivel 3 y sus secciones como nivel 4, como siempre', () => {
    expect(headingTags([section(1), paragraph, section(2), paragraph, section(2)])).toEqual([
      'h3',
      null,
      'h4',
      null,
      'h4',
    ]);
  });

  it('una página que empieza con un subtítulo lo muestra como nivel 3, y lo que cuelga de él como nivel 4', () => {
    expect(headingTags([section(2), paragraph, section(3), section(2)])).toEqual([
      'h3',
      null,
      'h4',
      'h3',
    ]);
  });

  it('un capítulo que aparece después vuelve a ser nivel 3 y sus secciones nivel 4', () => {
    expect(headingTags([section(2), section(1), section(2)])).toEqual(['h3', 'h3', 'h4']);
  });

  it('sin títulos, nada', () => {
    expect(headingTags([paragraph, paragraph])).toEqual([null, null]);
  });
});
