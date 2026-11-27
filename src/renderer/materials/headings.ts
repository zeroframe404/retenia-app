// El nivel de título con que el visor muestra cada sección de una página, sin saltear niveles (lo
// encontró la prueba de accesibilidad de la Fase 19 en la página 2 del PDF del elenco): el nivel más
// alto que apareció hasta ahí va como título de nivel 3 y lo que cuelga de él, como nivel 4. Así una
// página que empieza con un subtítulo («1.2 Parámetros y estadísticos») lo muestra como nivel 3, y un
// capítulo con sus secciones sigue como siempre (3 y 4).
export function headingTags(
  blocks: readonly { type: string; level: number }[],
): ('h3' | 'h4' | null)[] {
  let top = Number.POSITIVE_INFINITY;
  return blocks.map((block) => {
    if (block.type !== 'section') {
      return null;
    }
    if (block.level <= top) {
      top = block.level;
      return 'h3';
    }
    return 'h4';
  });
}
