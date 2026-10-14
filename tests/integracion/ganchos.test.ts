import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOT, run } from '../../tools/lib/proceso.mjs';
import { cleanEnv, minimalCopy, removeCopy } from '../apoyo/red';

const folder = mkdtempSync(join(tmpdir(), 'retenia-ganchos-'));
// Una copia mínima con lo que necesitan los ganchos: así cada prueba usa sus propios datos y
// nunca toca archivos del proyecto real.
const copy = minimalCopy(['tools', 'src/core/clock', 'biome.json', '.gitignore', 'package.json']);
afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
  removeCopy(copy);
});

/** El gancho de edición de la copia, como lo llama Claude Code. */
function postEdit(filePath: string) {
  return run(process.execPath, [join(copy, 'tools', 'hooks', 'post-edit.mjs')], {
    env: cleanEnv(),
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath } }),
    timeoutMs: 30_000,
  });
}

describe('ganchos', () => {
  it('[CA-004] el gancho de commit frena un archivo con una clave y deja pasar uno limpio', async () => {
    const withKey = join(folder, 'ajustes.json');
    // La clave se arma en el momento para que no quede escrita en el repositorio.
    const key = `sk-ant-${'api03'}-${'GanchoDePruebaNoReal'.repeat(4)}${'y'.repeat(13)}AA`;
    writeFileSync(withKey, `${JSON.stringify({ key }, null, 2)}\n`);
    const clean = join(folder, 'limpio.json');
    writeFileSync(clean, '{ "tema": "oscuro" }\n');

    const blocked = await run(
      process.execPath,
      [join(ROOT, 'tools', 'hooks', 'secretos.mjs'), withKey],
      { env: cleanEnv() },
    );
    expect(blocked.code).toBe(1);
    expect(blocked.stderr).toContain('Commit frenado: encontré un posible secreto');
    expect(blocked.stderr).toContain('anthropic');
    expect(blocked.stderr).not.toContain(key);

    const passes = await run(
      process.execPath,
      [join(ROOT, 'tools', 'hooks', 'secretos.mjs'), clean],
      {
        env: cleanEnv(),
      },
    );
    expect(passes.code).toBe(0);
  });

  it('[CA-007] el freno de cierre deja pasar el segundo intento (stop_hook_active) sin correr nada', async () => {
    const r = await run(process.execPath, [join(ROOT, 'tools', 'hooks', 'stop.mjs')], {
      env: cleanEnv(),
      input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: true }),
      timeoutMs: 10_000,
    });
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
  });

  it('el gancho de edición da formato a un archivo del proyecto, lo revisa y devuelve lo que quedó mal', async () => {
    const sample = join(copy, 'tools', 'muestra.mjs');
    writeFileSync(sample, 'export const   a = Date.now()\n');
    const r = await postEdit(sample);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Revisión de tools/muestra.mjs: quedó algo para arreglar.');
    expect(r.stderr).toContain('Reloj del sistema');
    expect(readFileSync(sample, 'utf8')).toBe('export const a = Date.now();\n');

    writeFileSync(sample, 'export const a = 1;\n');
    const clean = await postEdit(sample);
    expect(clean.code, clean.stderr).toBe(0);
    expect(readFileSync(sample, 'utf8')).toBe('export const a = 1;\n');
  });

  it('el gancho de edición deja en paz los archivos de fuera del proyecto, aunque estén en otra unidad', async () => {
    const outside = join(folder, 'ajeno.mjs');
    writeFileSync(outside, 'export const   a = Date.now()\n');
    const r = await postEdit(outside);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(readFileSync(outside, 'utf8')).toBe('export const   a = Date.now()\n');
  });

  it('[CA-001] si la red ni siquiera puede arrancar, igual termina con una línea ROJO y su motivo', async () => {
    const broken = minimalCopy(['tools', 'src/core/clock', 'package.json']);
    try {
      // Un TypeScript que Node no sabe leer directamente rompe la carga del reloj.
      appendFileSync(join(broken, 'src', 'core', 'clock', 'index.ts'), 'export enum Zone { BA }\n');
      const network = await run(process.execPath, [join(broken, 'tools', 'verify.mjs')], {
        env: cleanEnv({ RETENIA_RUN_DIR: join(broken, '.cache', 'corrida') }),
        timeoutMs: 30_000,
      });
      const lines = network.stdout.trimEnd().split(/\r?\n/);
      expect(network.code).toBe(1);
      expect(lines.filter((l) => /^(VERDE|ROJO) · /.test(l))).toEqual([
        'ROJO · 1 falla · copiá desde acá hasta el final y pegáselo a Claude Code',
      ]);
      expect(network.stdout).toContain('La red misma: no pudo arrancar');
    } finally {
      removeCopy(broken);
    }
  });

  it('[CA-007] si la red ni siquiera puede arrancar, el freno de cierre igual frena', async () => {
    const broken = minimalCopy(['tools', 'src/core/clock', 'package.json']);
    try {
      appendFileSync(join(broken, 'src', 'core', 'clock', 'index.ts'), 'export enum Zone { BA }\n');
      const r = await run(process.execPath, [join(broken, 'tools', 'hooks', 'stop.mjs')], {
        env: cleanEnv(),
        input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false }),
        timeoutMs: 30_000,
      });
      expect(r.code).toBe(2);
      expect(r.stderr).toContain('Freno de cierre: no pude correr la red');
    } finally {
      removeCopy(broken);
    }
  });
});
