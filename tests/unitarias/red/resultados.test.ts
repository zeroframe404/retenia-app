import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { formatDateTime, formatDuration } from '../../../tools/lib/reloj.mjs';
import {
  layerOfFile,
  readPlaywrightReport,
  readVitestReport,
} from '../../../tools/lib/resultados.mjs';
import { inBuenosAires } from '../../apoyo/fechas';

const folder = mkdtempSync(join(tmpdir(), 'retenia-informes-'));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

describe('lectura de informes', () => {
  it('[CA-001] cuenta las pruebas del informe de Vitest tal como vienen', () => {
    const path = join(folder, 'vitest.json');
    writeFileSync(
      path,
      JSON.stringify({
        testResults: [
          {
            name: 'H:/Retenia/tests/unitarias/x.test.ts',
            status: 'failed',
            assertionResults: [
              { title: 'a', status: 'passed', failureMessages: [], meta: {} },
              { title: 'b', status: 'failed', failureMessages: ['AssertionError: x'], meta: {} },
              {
                title: 'c',
                status: 'skipped',
                failureMessages: [],
                meta: { tableCase: { table: 't', input: 'e', expected: '1', actual: '1' } },
              },
            ],
          },
          {
            name: 'H:/Retenia/tests/red/y.test.ts',
            status: 'failed',
            message: 'no carga',
            assertionResults: [],
          },
        ],
      }),
    );
    const report = readVitestReport(path);
    expect(report?.tests.map((t) => t.status)).toEqual(['passed', 'failed', 'skipped']);
    expect(report?.tests[2]?.tableCase).toEqual({
      table: 't',
      input: 'e',
      expected: '1',
      actual: '1',
    });
    expect(report?.brokenFiles).toEqual([
      { file: 'H:/Retenia/tests/red/y.test.ts', message: 'no carga' },
    ]);
    expect(readVitestReport(join(folder, 'no-existe.json'))).toBeNull();
  });

  it('[CA-001] cuenta las pruebas del informe de punta a punta tal como vienen', () => {
    const path = join(folder, 'playwright.json');
    writeFileSync(
      path,
      JSON.stringify({
        suites: [
          {
            specs: [
              {
                title: 'abre',
                file: 'v.spec.ts',
                tests: [{ status: 'expected', results: [{ duration: 5 }] }],
              },
            ],
            suites: [
              {
                specs: [
                  {
                    title: 'falla',
                    file: 'v.spec.ts',
                    tests: [{ status: 'unexpected', results: [{ errors: [{ message: 'mal' }] }] }],
                  },
                  {
                    title: 'saltea',
                    file: 'v.spec.ts',
                    tests: [{ status: 'skipped', results: [] }],
                  },
                ],
              },
            ],
          },
        ],
        errors: [],
      }),
    );
    const report = readPlaywrightReport(path);
    expect(report?.tests.map((t) => [t.title, t.status])).toEqual([
      ['abre', 'passed'],
      ['falla', 'failed'],
      ['saltea', 'skipped'],
    ]);
    expect(report?.tests[1]?.messages).toEqual(['mal']);
  });

  it('nombra la capa de cada prueba por su carpeta', () => {
    expect(layerOfFile('H:/Retenia/tests/unitarias/red/x.test.ts')).toBe('Unitaria');
    expect(layerOfFile('tests\\e2e\\ventana.spec.ts')).toBe('Punta a punta');
    expect(layerOfFile('tests/red/sabotaje-1.test.ts')).toBe('Red completa y sabotajes');
    expect(layerOfFile('tests/componentes/ajustes.test.tsx')).toBe('Pantallas');
    expect(layerOfFile('tests/paquete/paquete.test.ts')).toBe('Paquete armado');
    expect(layerOfFile('tests/corte/corte.test.ts')).toBe('Corte a la fuerza');
  });

  it('muestra tiempos y fechas en castellano, con coma decimal y hora de Buenos Aires', () => {
    expect(formatDuration(1234)).toBe('1,2 s');
    expect(formatDuration(75_000)).toBe('1 min 15 s');
    expect(formatDateTime(inBuenosAires('15/03/2027 10:00'))).toBe('15/03/2027 10:00');
  });
});
