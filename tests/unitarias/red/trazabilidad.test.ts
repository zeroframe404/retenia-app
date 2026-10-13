import { describe, expect, it } from 'vitest';
import { expandirRangos, leerEspecificacion } from '../../../tools/lib/especificacion.mjs';
import { criteriosDelTitulo, tituloMalFormado } from '../../../tools/lib/resultados.mjs';
import { cruzar } from '../../../tools/lib/trazabilidad.mjs';

const MUESTRA = `# Historias

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

const especificacion = leerEspecificacion(MUESTRA);

describe('trazabilidad', () => {
  it('[CA-008] lee historias, criterios en tres renglones y la tabla «Criterio por fase»', () => {
    expect(especificacion.historias.map((h: { id: string }) => h.id)).toEqual(['H-01', 'H-02']);
    expect(especificacion.historias[0]?.criterios[1]).toEqual({
      id: 'CA-002',
      dado: 'un repaso a las 02:30',
      cuando: 'se calcula su día',
      entonces: 'cuenta para el día anterior.',
    });
    expect(especificacion.fases).toEqual([
      { numero: '02', nombre: 'Andamiaje', historias: ['H-01'], criterios: ['CA-001', 'CA-002'] },
      { numero: '03', nombre: 'Esqueleto', historias: ['H-02'], criterios: ['CA-003'] },
    ]);
  });

  it('[CA-008] entiende los tramos de criterios con «a» y con comas', () => {
    expect(expandirRangos('CA-038 a CA-040, CA-372 a CA-373')).toEqual([
      'CA-038',
      'CA-039',
      'CA-040',
      'CA-372',
      'CA-373',
    ]);
    expect(() => expandirRangos('CA-1 y CA-2')).toThrow('No entiendo');
  });

  it('[CA-001] el identificador va al principio del título, entre corchetes', () => {
    expect(criteriosDelTitulo('[CA-003] [CA-004] sabotajes')).toEqual(['CA-003', 'CA-004']);
    expect(criteriosDelTitulo('día de estudio [CA-002]')).toEqual([]);
    expect(tituloMalFormado('día de estudio [CA-002]')).toBe(true);
    expect(tituloMalFormado('CA-002 · día de estudio')).toBe(true);
    expect(tituloMalFormado('el reloj fijo devuelve copias')).toBe(false);
  });

  it('[CA-001] un criterio de una fase cerrada sin prueba es una falla', () => {
    const r = cruzar({
      especificacion,
      titulos: [{ titulo: '[CA-001] veredicto', capa: 'Unitaria' }],
      cerradas: ['02'],
      enCurso: '03',
      exigirEnCurso: false,
    });
    expect(r.problemas).toEqual([
      'el criterio CA-002 (fase 02, cerrada) no tiene ninguna prueba con «[CA-002]» al principio del título.',
    ]);
    expect([r.numerador, r.denominador]).toEqual([1, 3]);
  });

  it('[CA-001] los criterios de la fase en curso se exigen recién al cerrarla', () => {
    const base = {
      especificacion,
      titulos: [{ titulo: '[CA-001] veredicto', capa: 'Unitaria' }],
      cerradas: [],
      enCurso: '02',
    };
    expect(cruzar({ ...base, exigirEnCurso: false }).problemas).toEqual([]);
    expect(cruzar({ ...base, exigirEnCurso: true }).problemas).toEqual([
      'el criterio CA-002 (fase 02, que se está cerrando) no tiene ninguna prueba con «[CA-002]» al principio del título.',
    ]);
  });

  it('[CA-001] una prueba que nombra un criterio inexistente o lo escribe mal es una falla', () => {
    const r = cruzar({
      especificacion,
      titulos: [
        { titulo: '[CA-999] no existe', capa: 'Unitaria' },
        { titulo: 'veredicto CA-001', capa: 'Unitaria' },
      ],
      cerradas: [],
      enCurso: null,
      exigirEnCurso: false,
    });
    expect(r.problemas).toHaveLength(2);
    expect(r.problemas[0]).toContain('CA-999, que no existe');
    expect(r.problemas[1]).toContain('no lo pone al principio entre corchetes');
  });
});
