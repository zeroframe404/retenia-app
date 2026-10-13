import { describe, expect, it } from 'vitest';
import { leerEspecificacionDelProyecto } from '../../tools/lib/especificacion.mjs';
import { RAIZ } from '../../tools/lib/proceso.mjs';

type Criterio = { id: string; dado: string | null; cuando: string | null; entonces: string | null };
type Historia = { id: string; criterios: Criterio[] };
type Fase = { numero: string; criterios: string[] };

describe('especificación del proyecto', () => {
  const especificacion = leerEspecificacionDelProyecto(RAIZ);
  const historias = especificacion.historias as Historia[];
  const fases = especificacion.fases as Fase[];

  it('[CA-008] lee las 74 historias y los 379 criterios, cada uno con Dado, cuando y entonces', () => {
    expect(historias).toHaveLength(74);
    const criterios = historias.flatMap((h) => h.criterios);
    expect(criterios).toHaveLength(379);
    expect(criterios.filter((c) => !c.dado || !c.cuando || !c.entonces)).toEqual([]);
  });

  it('[CA-001] la tabla «Criterio por fase» reparte los 379 criterios sin repetir ni olvidar ninguno', () => {
    const repartidos = fases.flatMap((f) => f.criterios);
    expect(repartidos).toHaveLength(379);
    expect(new Set(repartidos).size).toBe(379);
    expect(fases.find((f) => f.numero === '02')?.criterios).toEqual([
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
