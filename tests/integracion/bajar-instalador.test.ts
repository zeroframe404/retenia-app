import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOT, run } from '../../tools/lib/proceso.mjs';
import { cleanEnv } from '../apoyo/red';

// «Bajame el instalador de prueba» con un gh de mentira (la frontera externa es la red de GitHub):
// el guion de abajo contesta lo que contestaría gh y, al «bajar», deja un instalador en la carpeta.
const folder = mkdtempSync(join(tmpdir(), 'retenia-bajar-'));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

const FAKE_GH = `
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
const scenario = process.env.FAKE_GH_ESCENARIO;
if (args[0] === 'run' && args[1] === 'list') {
  if (scenario === 'sin-corridas') {
    console.log('[]');
  } else {
    console.log(JSON.stringify([
      { databaseId: 22, status: 'in_progress', conclusion: '', headSha: 'bbbbbbbbbbbb', createdAt: '2' },
      { databaseId: 11, status: 'completed', conclusion: 'success', headSha: 'aaaaaaaaaaaa', createdAt: '1' },
    ]));
  }
} else if (args[0] === 'run' && args[1] === 'download') {
  const id = args[2];
  const dir = args[args.indexOf('--dir') + 1];
  if (args[args.indexOf('--name') + 1] !== 'instalador-prueba' || id === '22') {
    console.error('no artifact matches');
    process.exit(1);
  }
  writeFileSync(join(dir, 'Retenia-prueba-instalador-0.0.0.exe'), 'instalador de mentira');
} else {
  console.error('comando inesperado', args);
  process.exit(2);
}
`;
const fakeGh = join(folder, 'gh-de-mentira.mjs');
writeFileSync(fakeGh, FAKE_GH);

function bajar(scenario: string) {
  const desktop = join(folder, `escritorio-${scenario}`);
  mkdirSync(desktop, { recursive: true });
  return {
    desktop,
    result: run(
      process.execPath,
      [join(ROOT, 'tools', 'bajar-instalador.mjs'), '--rama', 'fase-03'],
      {
        env: cleanEnv({
          RETENIA_GH_SCRIPT: fakeGh,
          RETENIA_ESCRITORIO: desktop,
          FAKE_GH_ESCENARIO: scenario,
        }),
        timeoutMs: 60_000,
      },
    ),
  };
}

describe('«Bajame el instalador de prueba»', () => {
  it('baja a tu Escritorio el instalador de la corrida más reciente que lo tenga y dice cómo se llama', async () => {
    const { desktop, result } = bajar('normal');
    const r = await result;
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('Se llama: Retenia-prueba-instalador-0.0.0.exe');
    expect(r.stdout).toContain('con el CI en verde');
    expect(readdirSync(desktop)).toEqual(['Retenia-prueba-instalador-0.0.0.exe']);
  });

  it('si el CI todavía no corrió para la rama, lo dice y no baja nada', async () => {
    const { desktop, result } = bajar('sin-corridas');
    const r = await result;
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('El CI todavía no corrió para la rama fase-03');
    expect(existsSync(join(desktop, 'Retenia-prueba-instalador-0.0.0.exe'))).toBe(false);
  });
});
