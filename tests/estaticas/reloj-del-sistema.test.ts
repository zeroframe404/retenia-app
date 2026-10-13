import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { binario, correr, jsonDe, RAIZ } from '../../tools/lib/proceso.mjs';

type Diagnostico = { message: string; location?: { path?: string } };

async function lint(carpeta: string, rutas: string[]): Promise<Diagnostico[]> {
  const r = await correr(
    process.execPath,
    [binario('@biomejs/biome', 'biome'), 'lint', '--reporter=json', '--colors=off', ...rutas],
    { cwd: carpeta },
  );
  return ((jsonDe(r.salida)?.diagnostics ?? []) as Diagnostico[]).filter((d) =>
    d.message.startsWith('Reloj del sistema'),
  );
}

// Una carpeta con la misma configuración de Biome y la misma regla que el proyecto, y archivos
// de muestra en las mismas rutas, para ver qué atrapa la regla sin tocar el proyecto.
const muestra = mkdtempSync(join(tmpdir(), 'retenia-reloj-'));
afterAll(() => rmSync(muestra, { recursive: true, force: true }));
for (const archivo of ['biome.json', '.gitignore', 'tools/biome/reloj-del-sistema.grit']) {
  mkdirSync(dirname(join(muestra, archivo)), { recursive: true });
  copyFileSync(join(RAIZ, archivo), join(muestra, archivo));
}

const CODIGO = [
  'export const a = Date.now();',
  'export const b = new Date();',
  'export const c = performance.now();',
  'export const d = globalThis.Date.now();',
  'export const e = Date.now;',
  "export const f = new Date('2027-03-15T10:00:00-03:00');",
  'export const g = new Date(Date.UTC(2027, 2, 15));',
  '',
].join('\n');

describe('regla «reloj del sistema»', () => {
  it('solo src/core/clock lee la hora del sistema: en el programa, las pruebas y la red no hay ninguna otra lectura', async () => {
    expect(await lint(RAIZ, ['src', 'tests', 'tools'])).toEqual([]);
  });

  it('la regla atrapa cada forma de leer la hora fuera del reloj y deja pasar las fechas armadas a mano', async () => {
    for (const archivo of [
      'src/renderer/muestra.ts',
      'src/main/muestra.ts',
      'tests/unitarias/muestra.ts',
      'tools/muestra.mjs',
      'src/core/clock/muestra.ts',
    ]) {
      mkdirSync(dirname(join(muestra, archivo)), { recursive: true });
      writeFileSync(join(muestra, archivo), CODIGO);
    }
    const porArchivo = new Map<string, number>();
    for (const d of await lint(muestra, ['.'])) {
      const ruta = (d.location?.path ?? '').split('\\').join('/');
      porArchivo.set(ruta, (porArchivo.get(ruta) ?? 0) + 1);
    }
    expect(Object.fromEntries(porArchivo)).toEqual({
      'src/renderer/muestra.ts': 5,
      'src/main/muestra.ts': 5,
      'tests/unitarias/muestra.ts': 5,
      'tools/muestra.mjs': 5,
    });
  });
});
