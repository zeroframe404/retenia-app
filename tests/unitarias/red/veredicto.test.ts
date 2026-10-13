import { describe, expect, it } from 'vitest';
import {
  armarVeredicto,
  buscarMarcas,
  comparacionConTag,
  lineaRoja,
  lineaVerde,
  problemaDeSalteadas,
} from '../../../tools/lib/veredicto.mjs';

const cuentas = { corridas: 31, fallaron: 0, salteadas: 0, cubiertos: 8, criterios: 8 };

describe('veredicto de la red', () => {
  it('[CA-001] la línea VERDE tiene exactamente el formato acordado', () => {
    expect(lineaVerde({ pruebas: 31, cubiertos: 8, total: 8 })).toBe(
      'VERDE · 31 pruebas · 0 fallas · 0 salteadas · 8 de 8 criterios cubiertos',
    );
    expect(lineaVerde({ pruebas: 1, cubiertos: 1, total: 1 })).toBe(
      'VERDE · 1 prueba · 0 fallas · 0 salteadas · 1 de 1 criterio cubierto',
    );
  });

  it('[CA-001] la línea ROJO tiene exactamente el formato acordado', () => {
    expect(lineaRoja(3)).toBe(
      'ROJO · 3 fallas · copiá desde acá hasta el final y pegáselo a Claude Code',
    );
    expect(lineaRoja(1)).toBe(
      'ROJO · 1 falla · copiá desde acá hasta el final y pegáselo a Claude Code',
    );
  });

  it('[CA-001] sin problemas el veredicto es una sola línea VERDE con las cifras que recibe', () => {
    const v = armarVeredicto({ problemas: [], cuentas, registros: 'registros' });
    expect(v.verde).toBe(true);
    expect(v.lineas).toEqual([
      'VERDE · 31 pruebas · 0 fallas · 0 salteadas · 8 de 8 criterios cubiertos',
    ]);
  });

  it('[CA-001] con un problema es ROJO y debajo va el resumen de fallas en castellano', () => {
    const v = armarVeredicto({
      problemas: [
        { capa: 'Pruebas', texto: 'falló «[CA-002] día de estudio: …».' },
        { capa: 'Salteadas', texto: 'hay 2 salteadas: …', peso: 2 },
      ],
      cuentas: { ...cuentas, fallaron: 1, salteadas: 2 },
      registros: 'registros',
    });
    expect(v.verde).toBe(false);
    expect(v.fallas).toBe(3);
    expect(v.lineas[0]).toBe(lineaRoja(3));
    expect(v.lineas[1]).toBe('Resumen de fallas:');
    expect(v.lineas[2]).toBe('1. Pruebas: falló «[CA-002] día de estudio: …».');
    expect(v.lineas[3]).toBe('2. Salteadas: hay 2 salteadas: …');
    expect(v.lineas[4]).toBe(
      'Cuentas: 31 pruebas corridas · 1 falló · 2 salteadas · 8 de 8 criterios cubiertos.',
    );
  });

  it('[CA-005] una prueba salteada suma una falla y el aviso dice «1 salteada»', () => {
    const aviso = problemaDeSalteadas([{ titulo: '[CA-002] día de estudio: algo' }], []);
    expect(aviso?.peso).toBe(1);
    expect(aviso?.texto).toContain('hay 1 salteada: «[CA-002] día de estudio: algo»');
    expect(problemaDeSalteadas([], [])).toBeNull();
  });

  it('[CA-005] encuentra las marcas que saltean o aíslan pruebas leyendo el código', () => {
    // Las marcas se arman por partes para que este archivo no tenga ninguna.
    const punto = '.';
    const codigo = [
      `it${punto}skip('a', () => {});`,
      `test${punto}only('b', () => {});`,
      `describe${punto}todo('c');`,
      `it${punto}for(casos)('d', () => {});`,
      `test${punto}fixme('e', () => {});`,
      `it${punto}skipIf(true)('f', () => {});`,
    ].join('\n');
    expect(buscarMarcas(codigo)).toEqual([
      { renglon: 1, marca: 'skip', tipo: 'skip' },
      { renglon: 2, marca: 'only', tipo: 'only' },
      { renglon: 3, marca: 'todo', tipo: 'skip' },
      { renglon: 5, marca: 'fixme', tipo: 'skip' },
      { renglon: 6, marca: 'skipIf', tipo: 'skip' },
    ]);
  });

  it('[CA-001] da rojo si la cantidad de pruebas bajó respecto del último tag fase-NN-ok', () => {
    expect(comparacionConTag({ actual: 29, enTag: 31, tag: 'fase-02-ok' })).toContain(
      'el tag fase-02-ok tenía 31 y ahora hay 29',
    );
    expect(comparacionConTag({ actual: 31, enTag: 31, tag: 'fase-02-ok' })).toBeNull();
    expect(comparacionConTag({ actual: 40, enTag: 31, tag: 'fase-02-ok' })).toBeNull();
    expect(comparacionConTag({ actual: 3, enTag: undefined, tag: 'fase-02-ok' })).toBeNull();
  });
});
