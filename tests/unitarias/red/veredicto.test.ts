import { describe, expect, it } from 'vitest';
import { parseTagCounts, tagMessage } from '../../../tools/lib/fases.mjs';
import {
  buildVerdict,
  compareWithTag,
  explainFailure,
  findMarkers,
  greenLine,
  redLine,
  skippedProblem,
  startupFailure,
  tagCountProblem,
} from '../../../tools/lib/veredicto.mjs';

const counts = { run: 31, failed: 0, skipped: 0, covered: 8, criteria: 8 };

describe('veredicto de la red', () => {
  it('[CA-001] la línea VERDE tiene exactamente el formato acordado', () => {
    expect(greenLine({ tests: 31, covered: 8, total: 8 })).toBe(
      'VERDE · 31 pruebas · 0 fallas · 0 salteadas · 8 de 8 criterios cubiertos',
    );
    expect(greenLine({ tests: 1, covered: 1, total: 1 })).toBe(
      'VERDE · 1 prueba · 0 fallas · 0 salteadas · 1 de 1 criterio cubierto',
    );
  });

  it('[CA-001] la línea ROJO tiene exactamente el formato acordado', () => {
    expect(redLine(3)).toBe(
      'ROJO · 3 fallas · copiá desde acá hasta el final y pegáselo a Claude Code',
    );
    expect(redLine(1)).toBe(
      'ROJO · 1 falla · copiá desde acá hasta el final y pegáselo a Claude Code',
    );
  });

  it('[CA-001] sin problemas el veredicto es una sola línea VERDE con las cifras que recibe', () => {
    const v = buildVerdict({ problems: [], counts, logs: 'registros' });
    expect(v.green).toBe(true);
    expect(v.lines).toEqual([
      'VERDE · 31 pruebas · 0 fallas · 0 salteadas · 8 de 8 criterios cubiertos',
    ]);
  });

  it('[CA-001] con un problema es ROJO y debajo va el resumen de fallas en castellano', () => {
    const v = buildVerdict({
      problems: [
        { layer: 'Pruebas', text: 'falló «[CA-002] día de estudio: …».' },
        { layer: 'Salteadas', text: 'hay 2 salteadas: …', weight: 2 },
      ],
      counts: { ...counts, failed: 1, skipped: 2 },
      logs: 'registros',
    });
    expect(v.green).toBe(false);
    expect(v.failures).toBe(3);
    expect(v.lines[0]).toBe(redLine(3));
    expect(v.lines[1]).toBe('Resumen de fallas:');
    expect(v.lines[2]).toBe('1. Pruebas: falló «[CA-002] día de estudio: …».');
    expect(v.lines[3]).toBe('2. Salteadas: hay 2 salteadas: …');
    expect(v.lines[4]).toBe(
      'Cuentas: 31 pruebas corridas · 1 falló · 2 salteadas · 8 de 8 criterios cubiertos.',
    );
  });

  it('[CA-001] si la red no puede arrancar, igual empieza con la línea ROJO y dice por qué', () => {
    const lines = startupFailure(new Error('no encontré el reloj'));
    expect(lines[0]).toBe(redLine(1));
    expect(lines[2]).toContain('La red misma: no pudo arrancar');
    expect(lines[2]).toContain('no encontré el reloj');
  });

  it('[CA-001] el resumen explica la falla de una prueba en castellano y conserva su causa', () => {
    expect(
      explainFailure(
        "AssertionError: expected 'martes 16/03/2027' to be 'lunes 15/03/2027' // Object.is equality",
      ),
    ).toBe("Esperaba 'lunes 15/03/2027' y dio 'martes 16/03/2027'.");
    expect(explainFailure('AssertionError: expected null not to be null')).toBe(
      'Esperaba que null no fuera null.',
    );
    const withCause = explainFailure(
      "AssertionError: ROJO · 1 falla · copiá…\n1. Código muerto: knip terminó con error: expected 'ROJO · 1 falla · copiá…' to match /^VERDE · /",
    );
    expect(withCause).toContain('Esperaba /^VERDE · / y dio');
    expect(withCause).toContain('1. Código muerto: knip terminó con error');
    expect(explainFailure('Error: Property failed after 1 tests\n{ seed: 1 }')).toBe(
      'Error: Property failed after 1 tests',
    );
  });

  it('[CA-005] una prueba salteada suma una falla y el aviso dice «1 salteada»', () => {
    const notice = skippedProblem([{ title: '[CA-002] día de estudio: algo' }], []);
    expect(notice?.weight).toBe(1);
    expect(notice?.text).toContain('hay 1 salteada: «[CA-002] día de estudio: algo»');
    expect(skippedProblem([], [])).toBeNull();
  });

  it('[CA-005] encuentra las marcas que saltean o aíslan pruebas leyendo el código', () => {
    // Las marcas se arman por partes para que este archivo no tenga ninguna.
    const dot = '.';
    const code = [
      `it${dot}skip('a', () => {});`,
      `test${dot}only('b', () => {});`,
      `describe${dot}todo('c');`,
      `it${dot}for(cases)('d', () => {});`,
      `test${dot}fixme('e', () => {});`,
      `it${dot}skipIf(true)('f', () => {});`,
    ].join('\n');
    expect(findMarkers(code)).toEqual([
      { line: 1, marker: 'skip', kind: 'skip' },
      { line: 2, marker: 'only', kind: 'only' },
      { line: 3, marker: 'todo', kind: 'skip' },
      { line: 5, marker: 'fixme', kind: 'skip' },
      { line: 6, marker: 'skipIf', kind: 'skip' },
    ]);
  });

  it('[CA-001] da rojo si la cantidad de pruebas bajó respecto del último tag fase-NN-ok', () => {
    expect(compareWithTag({ current: 29, atTag: 31, tag: 'fase-02-ok' })).toContain(
      'el tag fase-02-ok tenía 31 y ahora hay 29',
    );
    expect(compareWithTag({ current: 31, atTag: 31, tag: 'fase-02-ok' })).toBeNull();
    expect(compareWithTag({ current: 40, atTag: 31, tag: 'fase-02-ok' })).toBeNull();
  });

  it('[CA-001] la cantidad de pruebas de cada orden viaja en el mensaje del tag fase-NN-ok', () => {
    const message = tagMessage({ verificar: 44, 'verificar:todo': 57 }, '02');
    expect(message).toBe(
      'Fase 02 aprobada.\n\nPruebas de verificar: 44\nPruebas de verificar:todo: 57',
    );
    expect(parseTagCounts(message)).toEqual({ verificar: 44, 'verificar:todo': 57 });
    expect(parseTagCounts('Fase 02 aprobada.')).toBeNull();
  });

  it('[CA-001] un tag de cierre sin la cantidad de pruebas es una falla desde la Fase 02, para que el control no se apague solo', () => {
    // Las Fases 00 y 01 no tenían pruebas: sus tags no guardan cantidades y está bien.
    expect(
      tagCountProblem({ tag: 'fase-01-ok', phase: '01', atTag: null, current: 50 }),
    ).toBeNull();
    expect(tagCountProblem({ tag: 'fase-02-ok', phase: '02', atTag: null, current: 50 })).toContain(
      'el tag fase-02-ok no tiene guardada la cantidad de pruebas',
    );
    expect(tagCountProblem({ tag: 'fase-02-ok', phase: '02', atTag: 56, current: 55 })).toContain(
      'tenía 56 y ahora hay 55',
    );
    expect(tagCountProblem({ tag: 'fase-02-ok', phase: '02', atTag: 56, current: 56 })).toBeNull();
  });
});
