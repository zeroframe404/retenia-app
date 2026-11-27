import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/core/clock';
import { LOG_MAX_BYTES } from '../../src/core/unexpected-errors';
import { createErrorLog } from '../../src/main/unexpected-errors';
import { findSecret } from '../../tools/lib/buscar-clave.mjs';
import { tempDataFolder } from '../apoyo/base';
import { TEST_KEY } from '../apoyo/caja-segura';

// El registro de los errores inesperados del proceso principal (docs/decisiones.md, 27/11/2026),
// con archivos de verdad: registros/retenia.log en la carpeta de datos, un renglón por error, sin
// la clave de la IA, rotado de a 1 MB y sin tirar nunca, aunque el disco no deje escribir.

const AT = new Date('2026-11-27T17:03:05Z');
const folders: Array<{ remove: () => void }> = [];

afterEach(() => {
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

function dataFolder(): string {
  const temp = tempDataFolder();
  folders.push(temp);
  return temp.folder;
}

function openLog(dataDir: string) {
  return createErrorLog({ dataDir, version: '0.19.0', clock: fixedClock(AT) });
}

function lines(file: string): unknown[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line));
}

describe('registro de errores inesperados', () => {
  it('anota cada error en registros/retenia.log de la carpeta de datos, un renglón por error', () => {
    const dataDir = dataFolder();
    const log = openLog(dataDir);
    expect(log.record({ error: new Error('primero'), origin: 'exception', phase: 'running' })).toBe(
      true,
    );
    expect(
      log.record({ error: new Error('segundo'), origin: 'rejection', phase: 'quitting' }),
    ).toBe(true);
    expect(lines(join(dataDir, 'registros', 'retenia.log'))).toMatchObject([
      {
        at: '27/11/2026 14:03:05',
        event: 'main.uncaught-exception',
        phase: 'running',
        version: '0.19.0',
        error: { name: 'Error', message: 'primero' },
      },
      {
        event: 'main.unhandled-rejection',
        phase: 'quitting',
        error: { message: 'segundo' },
      },
    ]);
  });

  it('la clave de la IA no queda en ningún archivo de la carpeta de datos', async () => {
    const dataDir = dataFolder();
    const error = new Error(`falló el pedido con ${TEST_KEY}`, {
      cause: new Error(`401: ${TEST_KEY}`),
    });
    error.stack = `Error: falló\n    at pedir (${TEST_KEY}:1:1)`;
    expect(openLog(dataDir).record({ error, origin: 'exception', phase: 'running' })).toBe(true);
    expect(await findSecret(TEST_KEY, [dataDir])).toEqual([]);
    expect(await findSecret('RETENIA-CLAVE-DE-PRUEBA', [dataDir])).toEqual([]);
  });

  it('al pasar de 1 MB empieza un archivo nuevo y guarda los cinco anteriores', () => {
    const dataDir = dataFolder();
    const folder = join(dataDir, 'registros');
    mkdirSync(folder);
    const log = openLog(dataDir);
    // Siete archivos llenos, uno detrás del otro: cada uno lleva su número adentro.
    for (let round = 1; round <= 7; round += 1) {
      writeFileSync(join(folder, 'retenia.log'), `lleno ${round}\n`.padEnd(LOG_MAX_BYTES, '.'));
      expect(
        log.record({ error: new Error(`error ${round}`), origin: 'exception', phase: 'running' }),
      ).toBe(true);
    }
    // El de ahora tiene solo el último renglón; los cinco anteriores, del más nuevo al más viejo.
    expect(lines(join(folder, 'retenia.log'))).toMatchObject([{ error: { message: 'error 7' } }]);
    for (let index = 1; index <= 5; index += 1) {
      const file = join(folder, `retenia.${index}.log`);
      expect(readFileSync(file, 'utf8').startsWith(`lleno ${8 - index}\n`)).toBe(true);
      expect(statSync(file).size).toBe(LOG_MAX_BYTES);
    }
    expect(existsSync(join(folder, 'retenia.6.log'))).toBe(false);
  });

  it('si el disco no deja escribir, no tira: avisa que no pudo', () => {
    const dataDir = dataFolder();
    // Donde iría la carpeta de los registros hay un archivo: no se puede crear.
    writeFileSync(join(dataDir, 'registros'), '');
    const log = openLog(dataDir);
    expect(
      log.record({ error: new Error('sin lugar'), origin: 'exception', phase: 'running' }),
    ).toBe(false);
  });
});
