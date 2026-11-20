import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseRange, resolveOriginal } from '../../src/main/materials/original-protocol';
import { tempDataFolder } from '../apoyo/base';

// «retenia-original://<material>» (Fase 13): la ventana pide el original de un material por su
// identificador y el principal lo resuelve a un archivo de `originales\`. Nunca acepta rutas.

const folders: ReturnType<typeof tempDataFolder>[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
});

const MATERIAL = '01930000-0000-7000-8000-000000000001';
const SHA = 'a'.repeat(64);

function setup() {
  const data = tempDataFolder();
  folders.push(data);
  mkdirSync(join(data.folder, 'originales'));
  writeFileSync(join(data.folder, 'originales', `${SHA}.pdf`), '%PDF-1.4');
  writeFileSync(join(data.folder, 'retenia.db'), 'la base');
  const lookup = (materialId: string) =>
    materialId === MATERIAL ? { sha256: SHA, ext: 'pdf' as const } : null;
  return { dataDir: data.folder, lookup };
}

describe('resolver un original', () => {
  it('el identificador de un material da su archivo con su tipo', () => {
    const { dataDir, lookup } = setup();
    expect(resolveOriginal(`retenia-original://${MATERIAL}`, lookup, dataDir)).toEqual({
      file: join(dataDir, 'originales', `${SHA}.pdf`),
      mime: 'application/pdf',
    });
    expect(resolveOriginal(`retenia-original://${MATERIAL}/`, lookup, dataDir)).not.toBeNull();
  });

  it('rutas trampa, absolutas, codificadas o con más partes: nada', () => {
    const { dataDir, lookup } = setup();
    for (const url of [
      'retenia-original://../retenia.db',
      'retenia-original://%2e%2e/retenia.db',
      'retenia-original://%2E%2E%2Fretenia.db',
      'retenia-original://C:/Windows/win.ini',
      'retenia-original:///C:/Windows/win.ini',
      `retenia-original://${MATERIAL}/../../retenia.db`,
      `retenia-original://${MATERIAL}/%2e%2e/retenia.db`,
      `retenia-original://${MATERIAL}?archivo=../retenia.db`,
      `retenia-original://${MATERIAL}#x`,
      'retenia-original://01930000-0000-7000-8000-000000000099',
      `retenia-image://${MATERIAL}`,
      `file:///${dataDir}/retenia.db`,
      'no es una dirección',
    ]) {
      expect(resolveOriginal(url, lookup, dataDir), url).toBeNull();
    }
  });

  it('una huella o una extensión que no son las esperadas: nada', () => {
    const { dataDir } = setup();
    expect(
      resolveOriginal(
        `retenia-original://${MATERIAL}`,
        () => ({ sha256: '../retenia', ext: 'pdf' }),
        dataDir,
      ),
    ).toBeNull();
    expect(
      resolveOriginal(
        `retenia-original://${MATERIAL}`,
        () => ({ sha256: SHA, ext: 'db' as never }),
        dataDir,
      ),
    ).toBeNull();
  });

  it('si «originales» es un enlace a otra carpeta, no se sirve nada', () => {
    const outside = tempDataFolder();
    folders.push(outside);
    writeFileSync(join(outside.folder, `${SHA}.pdf`), '%PDF-1.4');
    const data = tempDataFolder();
    folders.push(data);
    symlinkSync(outside.folder, join(data.folder, 'originales'), 'junction');
    const lookup = () => ({ sha256: SHA, ext: 'pdf' as const });
    expect(resolveOriginal(`retenia-original://${MATERIAL}`, lookup, data.folder)).toBeNull();
  });
});

describe('pedidos por rangos', () => {
  it('lee el rango pedido dentro del archivo; lo inválido o fuera del archivo se rechaza', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange(null, 1000)).toBeNull();
    for (const bad of ['bytes=1000-1001', 'bytes=5-2', 'bits=0-1', 'bytes=0-1,4-5', 'bytes=x-y']) {
      expect(parseRange(bad, 1000), bad).toBe('invalid');
    }
  });
});
