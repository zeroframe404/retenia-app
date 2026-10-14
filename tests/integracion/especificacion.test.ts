import { describe, expect, it } from 'vitest';
import { readProjectSpec } from '../../tools/lib/especificacion.mjs';
import { ROOT } from '../../tools/lib/proceso.mjs';

// Lectura de la especificación real. Sostiene la trazabilidad y el tablero, pero no comprueba
// por sí sola ningún criterio: por eso no lleva identificador.
describe('especificación del proyecto', () => {
  const spec = readProjectSpec(ROOT);

  it('lee las 74 historias y los 379 criterios, cada uno con Dado, cuando y entonces', () => {
    expect(spec.stories).toHaveLength(74);
    const criteria = spec.stories.flatMap((s) => s.criteria);
    expect(criteria).toHaveLength(379);
    expect(criteria.filter((c) => !c.given || !c.when || !c.outcome)).toEqual([]);
  });

  it('la tabla «Criterio por fase» reparte los 379 criterios sin repetir ni olvidar ninguno', () => {
    const assigned = spec.phases.flatMap((p) => p.criteria);
    expect(assigned).toHaveLength(379);
    expect(new Set(assigned).size).toBe(379);
    expect(spec.phases.find((p) => p.number === '02')?.criteria).toEqual([
      'CA-001',
      'CA-002',
      'CA-003',
      'CA-004',
      'CA-005',
      'CA-006',
      'CA-007',
      'CA-008',
    ]);
  });
});
