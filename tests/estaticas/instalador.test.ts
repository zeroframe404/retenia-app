import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../tools/lib/proceso.mjs';

// La configuración de los dos instaladores (docs/arquitectura.md, secciones 5 y 7). Se lee como
// texto: son archivos planos y esta prueba solo necesita ciertas líneas.
function config(variant: 'prueba' | 'real') {
  const text = readFileSync(join(ROOT, `electron-builder.${variant}.yml`), 'utf8');
  const value = (key: string) => new RegExp(`^\\s*${key}: (.+)$`, 'm').exec(text)?.[1]?.trim();
  return { text, value };
}

const test = config('prueba');
const real = config('real');

describe('instaladores: dos productos, dos carpetas de datos', () => {
  it('[CA-012] «Retenia (prueba)» tiene nombre, identificador y guid propios, distintos de los de «Retenia»', () => {
    expect(test.value('productName')).toBe('Retenia (prueba)');
    expect(real.value('productName')).toBe('Retenia');
    expect(test.value('appId')).toBe('io.github.zeroframe404.retenia-prueba');
    expect(real.value('appId')).toBe('io.github.zeroframe404.retenia');
    expect(test.value('guid')).toMatch(/^[0-9a-f-]{36}$/);
    expect(real.value('guid')).toMatch(/^[0-9a-f-]{36}$/);
    expect(test.value('guid')).not.toBe(real.value('guid'));
    expect(test.value('shortcutName')).toBe('Retenia (prueba)');
    expect(real.value('shortcutName')).toBe('Retenia');
  });

  it('[CA-012] el acceso del menú Inicio se crea y se instala por usuario, sin permisos de administrador', () => {
    for (const { value } of [test, real]) {
      expect(value('createStartMenuShortcut')).toBe('true');
      expect(value('perMachine')).toBe('false');
      expect(value('allowElevation')).toBe('false');
    }
  });

  it('[CA-012] desinstalar nunca borra los datos de quien lo usa', () => {
    expect(test.value('deleteAppDataOnUninstall')).toBe('false');
    expect(real.value('deleteAppDataOnUninstall')).toBe('false');
  });

  it('cada instalador empaqueta solo su variante compilada', () => {
    expect(test.text).toContain('out/prueba/**/*');
    expect(test.text).not.toContain('out/real');
    expect(real.text).toContain('out/real/**/*');
    expect(real.text).not.toContain('out/prueba');
    expect(test.value('main')).toBe('out/prueba/main/index.js');
    expect(real.value('main')).toBe('out/real/main/index.js');
  });

  it('el instalador de prueba no se confunde con el real en el nombre del archivo', () => {
    expect(test.value('artifactName')).toContain('prueba');
    expect(real.value('artifactName')).not.toContain('prueba');
  });

  it('el módulo nativo de la base queda fuera del asar', () => {
    for (const { text } of [test, real]) {
      expect(text).toMatch(/asarUnpack:\s*\n\s*- node_modules\/better-sqlite3\/\*\*/);
      expect(text).toContain('npmRebuild: false');
    }
  });
});

describe('piezas del Laboratorio en los instaladores (Fase 05)', () => {
  const unpacked = (text: string) =>
    (/asarUnpack:\s*\n((?:\s*- .+\n)+)/.exec(text)?.[1] ?? '')
      .split('\n')
      .map((line) => line.replace(/^\s*- /, '').trim())
      .filter(Boolean);

  it('[CA-025] sherpa-onnx (voz y transcripción) viaja fuera del asar, con sus DLL, en la variante de prueba', () => {
    expect(unpacked(test.text)).toEqual(
      expect.arrayContaining([
        'node_modules/sherpa-onnx-node/**',
        'node_modules/sherpa-onnx-win-x64/**',
      ]),
    );
  });

  it('[CA-029] los datos de español e inglés de tesseract.js viajan dentro del instalador de prueba, fuera del asar', () => {
    expect(unpacked(test.text)).toEqual(
      expect.arrayContaining([
        'node_modules/tesseract.js/**',
        'node_modules/tesseract.js-core/**',
        'node_modules/@tesseract.js-data/**',
      ]),
    );
    // Solo los datos que usa (enteros comprimidos), no la versión grande.
    expect(test.text).toContain('"!node_modules/@tesseract.js-data/*/4.0.0/**"');
  });

  it('[CA-028] el PDF de ejemplo viaja solo con la variante de prueba', () => {
    expect(test.text).toContain('from: "datos-de-ejemplo/Inferencia — capítulos 1 a 4.pdf"');
    expect(real.text).not.toContain('datos-de-ejemplo');
  });

  it('la versión de uso real no lleva las piezas del Laboratorio', () => {
    for (const name of ['sherpa-onnx', 'tesseract', 'pdfjs-dist']) {
      expect(unpacked(real.text).join('\n')).not.toContain(name);
    }
    expect(real.text).toContain('"!node_modules/{sherpa-onnx-node,sherpa-onnx-win-x64');
  });
});
