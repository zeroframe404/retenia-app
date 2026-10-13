import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { formatearDuracion, formatearFechaHora } from '../../../tools/lib/reloj.mjs';
import {
  capaDeArchivo,
  leerInformeDePlaywright,
  leerInformeDeVitest,
} from '../../../tools/lib/resultados.mjs';
import { inBuenosAires } from '../../apoyo/fechas';

const carpeta = mkdtempSync(join(tmpdir(), 'retenia-informes-'));
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

describe('lectura de informes', () => {
  it('[CA-001] cuenta las pruebas del informe de Vitest tal como vienen', () => {
    const ruta = join(carpeta, 'vitest.json');
    writeFileSync(
      ruta,
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
                meta: { caso: { tabla: 't', entrada: 'e', esperado: '1', obtenido: '1' } },
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
    const leido = leerInformeDeVitest(ruta);
    expect(leido?.pruebas.map((p: { estado: string }) => p.estado)).toEqual([
      'paso',
      'fallo',
      'salteada',
    ]);
    expect(leido?.pruebas[2]?.caso).toEqual({
      tabla: 't',
      entrada: 'e',
      esperado: '1',
      obtenido: '1',
    });
    expect(leido?.archivosRotos).toEqual([
      { archivo: 'H:/Retenia/tests/red/y.test.ts', mensaje: 'no carga' },
    ]);
    expect(leerInformeDeVitest(join(carpeta, 'no-existe.json'))).toBeNull();
  });

  it('[CA-001] cuenta las pruebas del informe de punta a punta tal como vienen', () => {
    const ruta = join(carpeta, 'playwright.json');
    writeFileSync(
      ruta,
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
    const leido = leerInformeDePlaywright(ruta);
    expect(
      leido?.pruebas.map((p: { titulo: string; estado: string }) => [p.titulo, p.estado]),
    ).toEqual([
      ['abre', 'paso'],
      ['falla', 'fallo'],
      ['saltea', 'salteada'],
    ]);
    expect(leido?.pruebas[1]?.mensajes).toEqual(['mal']);
  });

  it('nombra la capa de cada prueba por su carpeta', () => {
    expect(capaDeArchivo('H:/Retenia/tests/unitarias/red/x.test.ts')).toBe('Unitaria');
    expect(capaDeArchivo('tests\\e2e\\ventana.spec.ts')).toBe('Punta a punta');
    expect(capaDeArchivo('tests/red/sabotaje-1.test.ts')).toBe('Red completa y sabotajes');
  });

  it('muestra tiempos y fechas en castellano, con coma decimal y hora de Buenos Aires', () => {
    expect(formatearDuracion(1234)).toBe('1,2 s');
    expect(formatearDuracion(75_000)).toBe('1 min 15 s');
    expect(formatearFechaHora(inBuenosAires('15/03/2027 10:00'))).toBe('15/03/2027 10:00');
  });
});
