import { describe, expect, it } from 'vitest';
import { expandRanges, parseSpec } from '../../../tools/lib/especificacion.mjs';
import { criteriaInTitle, isMalformedTitle } from '../../../tools/lib/resultados.mjs';
import { crossCheck } from '../../../tools/lib/trazabilidad.mjs';

const SAMPLE = `# Historias

## H-01 · Imprescindible · Fase 02

Como dueño quiero una red, para confiar.

- **CA-001**
  - Dado el proyecto,
  - cuando corro la red,
  - entonces veo el veredicto.
- **CA-002**
  - Dado un repaso a las 02:30,
  - cuando se calcula su día,
  - entonces cuenta para el día anterior.

## H-02 · Importante · Fase 03

Como estudiante quiero tarjetas, para repasar.

- **CA-003**
  - Dado nada,
  - cuando creo una tarjeta,
  - entonces la veo.

# Criterio por fase

| Fase | Nombre | Historias | Criterios | Cantidad |
|------|--------|-----------|-----------|----------|
| 02 | Andamiaje | H-01 | CA-001 a CA-002 | 2 |
| 03 | Esqueleto | H-02 | CA-003 | 1 |
`;

const spec = parseSpec(SAMPLE);

// La lectura de la especificación sostiene la trazabilidad, pero no prueba un criterio por sí
// sola: estas dos van sin identificador.
describe('lectura de la especificación', () => {
  it('lee historias, criterios en tres renglones y la tabla «Criterio por fase»', () => {
    expect(spec.stories.map((s) => s.id)).toEqual(['H-01', 'H-02']);
    expect(spec.stories[0]?.criteria[1]).toEqual({
      id: 'CA-002',
      given: 'un repaso a las 02:30',
      when: 'se calcula su día',
      outcome: 'cuenta para el día anterior.',
    });
    expect(spec.phases).toEqual([
      { number: '02', name: 'Andamiaje', stories: ['H-01'], criteria: ['CA-001', 'CA-002'] },
      { number: '03', name: 'Esqueleto', stories: ['H-02'], criteria: ['CA-003'] },
    ]);
  });

  it('entiende los tramos de criterios con «a» y con comas', () => {
    expect(expandRanges('CA-038 a CA-040, CA-372 a CA-373')).toEqual([
      'CA-038',
      'CA-039',
      'CA-040',
      'CA-372',
      'CA-373',
    ]);
    expect(() => expandRanges('CA-1 y CA-2')).toThrow('No entiendo');
  });
});

describe('trazabilidad', () => {
  it('[CA-001] el identificador va al principio del título, entre corchetes', () => {
    expect(criteriaInTitle('[CA-003] [CA-004] sabotajes')).toEqual(['CA-003', 'CA-004']);
    expect(criteriaInTitle('día de estudio [CA-002]')).toEqual([]);
    expect(isMalformedTitle('día de estudio [CA-002]')).toBe(true);
    expect(isMalformedTitle('CA-002 · día de estudio')).toBe(true);
    expect(isMalformedTitle('el reloj fijo devuelve copias')).toBe(false);
  });

  it('[CA-001] un criterio de una fase cerrada sin prueba es una falla', () => {
    const r = crossCheck({
      spec,
      titles: [{ title: '[CA-001] veredicto', layer: 'Unitaria' }],
      closed: ['02'],
      current: '03',
      requireCurrent: false,
    });
    expect(r.problems).toEqual([
      'el criterio CA-002 (fase 02, cerrada) no tiene ninguna prueba con «[CA-002]» al principio del título.',
    ]);
    expect([r.covered, r.total]).toEqual([1, 3]);
  });

  it('[CA-001] los criterios de la fase en curso se exigen recién al cerrarla', () => {
    const base = {
      spec,
      titles: [{ title: '[CA-001] veredicto', layer: 'Unitaria' }],
      closed: [],
      current: '02',
    };
    expect(crossCheck({ ...base, requireCurrent: false }).problems).toEqual([]);
    expect(crossCheck({ ...base, requireCurrent: true }).problems).toEqual([
      'el criterio CA-002 (fase 02, que se está cerrando) no tiene ninguna prueba con «[CA-002]» al principio del título.',
    ]);
  });

  it('[CA-001] una prueba que nombra un criterio inexistente o lo escribe mal es una falla', () => {
    const r = crossCheck({
      spec,
      titles: [
        { title: '[CA-999] no existe', layer: 'Unitaria' },
        { title: 'veredicto CA-001', layer: 'Unitaria' },
      ],
      closed: [],
      current: null,
      requireCurrent: false,
    });
    expect(r.problems).toHaveLength(2);
    expect(r.problems[0]).toContain('CA-999, que no existe');
    expect(r.problems[1]).toContain('no lo pone al principio entre corchetes');
  });
});
