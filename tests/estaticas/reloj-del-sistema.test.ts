import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { firstJson, packageBin, ROOT, run } from '../../tools/lib/proceso.mjs';
import {
  findSystemClockReads,
  scanProjectForSystemClock,
} from '../../tools/lib/reloj-del-sistema.mjs';

// Formas de leer la hora del sistema, incluidas las rebuscadas.
const READS = [
  'export const a = Date.now();',
  'export const b = new Date();',
  'export const c = new Date;',
  'export const d = new (Date)();',
  'export const e = Date();',
  "export const f = Date['now']();",
  "export const g = globalThis['Date'].now();",
  'export const h = globalThis.Date.now();',
  'const D = Date; export const i = new D();',
  'export const j = Reflect.construct(Date, []);',
  'export const k = performance.now();',
  'export const l = performance.timeOrigin;',
  'export const m = process.hrtime.bigint();',
  'export const n = Temporal.Now.instant();',
  "export const o = new Intl.DateTimeFormat('es-AR').format();",
  // Las que encontró el revisor en la segunda pasada.
  'const g = globalThis; export const p = g.Date.now();',
  'export const q = globalThis[`Date`].now();',
  "export const r = globalThis['Da' + 'te'].now();",
  "export const s = new Intl.DateTimeFormat('es-AR').format(undefined);",
  "export const t = new Intl.DateTimeFormat('es-AR').formatToParts(void 0);",
  'const { now } = performance; export const u = now();',
  'const p = performance; export const v = p.now();',
  "import { performance as w } from 'node:perf_hooks';",
  "import * as x from 'node:perf_hooks';",
  "import { hrtime } from 'node:process';",
  'const { hrtime: y } = process;',
  'export const z = new Date(...[]);',
  'const { Now } = Temporal;',
  "export const aa = require('node:perf_hooks').performance.now();",
  "export const bb = await import('perf_hooks');",
  'export const cc = window.Date.now();',
];

// Fechas armadas a mano: están permitidas en todos lados.
const ALLOWED = [
  "export const a = new Date('2027-03-15T10:00:00-03:00');",
  'export const b = Date.UTC(2027, 2, 15);',
  "export const c = Date.parse('2027-03-15');",
  'export function d(x: Date): Date { return new Date(x.getTime()); }',
  "export const e = new Intl.DateTimeFormat('es-AR').format(new Date(0));",
  'export const f = { Date: 1 };',
  // Leer propiedades fijas que no dan la hora también está permitido.
  'export const g = process.env.RETENIA_DATOS ?? process.argv[2];',
  "export const h = performance.mark('arranque');",
  'export const i = (globalThis as { require?: unknown }).require;',
  'export const j = window.retenia;',
  'export const k = { ...process.env };',
];

const sample = mkdtempSync(join(tmpdir(), 'retenia-reloj-'));
afterAll(() => rmSync(sample, { recursive: true, force: true }));

describe('regla «reloj del sistema»', () => {
  it('solo src/core/clock lee la hora del sistema: en ningún otro archivo de código del proyecto hay otra lectura', async () => {
    expect(await scanProjectForSystemClock(ROOT)).toEqual([]);
  });

  it('la regla atrapa cada forma de leer la hora fuera del reloj y deja pasar las fechas armadas a mano', () => {
    for (const code of READS) {
      expect(findSystemClockReads(code, 'src/main/muestra.ts'), code).not.toEqual([]);
    }
    for (const code of ALLOWED) {
      expect(findSystemClockReads(code, 'src/main/muestra.ts'), code).toEqual([]);
    }
    expect(
      findSystemClockReads('export const A = () => <p>{Date.now()}</p>;', 'src/muestra.jsx'),
    ).not.toEqual([]);
  });

  it('un comentario no apaga la regla, y apagar la de Biome también es una falta', () => {
    const ignore = `// ${'biome'}-ignore lint/plugin: no hace falta`;
    expect(
      findSystemClockReads(`${ignore}\nexport const a = Date.now();\n`, 'tools/x.mjs'),
    ).toEqual([
      { line: 1, text: 'apaga la regla del reloj con un comentario' },
      { line: 2, text: '`Date.now` no está permitido fuera del reloj' },
    ]);
  });

  it('Biome también la marca al escribir, en todo archivo de código salvo el reloj (incluidos los de la raíz)', async () => {
    for (const file of ['biome.json', '.gitignore', 'tools/biome/reloj-del-sistema.grit']) {
      mkdirSync(dirname(join(sample, file)), { recursive: true });
      copyFileSync(join(ROOT, file), join(sample, file));
    }
    const files = [
      'src/renderer/muestra.ts',
      'src/main/muestra.ts',
      'tests/unitarias/muestra.ts',
      'tools/muestra.mjs',
      'muestra.config.ts',
      'src/core/clock/muestra.ts',
    ];
    for (const file of files) {
      mkdirSync(dirname(join(sample, file)), { recursive: true });
      writeFileSync(
        join(sample, file),
        'export const a = Date.now();\nexport const b = new Date();\n',
      );
    }
    const r = await run(
      process.execPath,
      [packageBin('@biomejs/biome', 'biome'), 'lint', '--reporter=json', '--colors=off', '.'],
      { cwd: sample },
    );
    const perFile = new Map<string, number>();
    for (const d of (firstJson(r.stdout)?.diagnostics ?? []) as {
      message: string;
      location?: { path?: string };
    }[]) {
      if (d.message.startsWith('Reloj del sistema')) {
        const path = (d.location?.path ?? '').split('\\').join('/');
        perFile.set(path, (perFile.get(path) ?? 0) + 1);
      }
    }
    expect(Object.fromEntries(perFile)).toEqual({
      'src/renderer/muestra.ts': 2,
      'src/main/muestra.ts': 2,
      'tests/unitarias/muestra.ts': 2,
      'tools/muestra.mjs': 2,
      'muestra.config.ts': 2,
    });
  });

  it('Node puede cargar el reloj directamente, como lo hacen las herramientas de la red', async () => {
    const clock = pathToFileURL(join(ROOT, 'src', 'core', 'clock', 'index.ts')).href;
    const r = await run(process.execPath, [
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(clock)}); if (typeof m.systemClock !== 'function') process.exit(3);`,
    ]);
    expect(r.code, r.stderr).toBe(0);
  });
});
