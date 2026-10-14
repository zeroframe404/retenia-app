import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { run } from '../../tools/lib/proceso.mjs';
import { cleanEnv, copyProject, removeCopy } from '../apoyo/red';
import { applySabotage } from '../sabotage/sabotajes.mjs';

function brake(copy: string, stopHookActive: boolean) {
  return run(process.execPath, [join(copy, 'tools', 'hooks', 'stop.mjs')], {
    cwd: copy,
    env: cleanEnv(),
    input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: stopHookActive }),
    timeoutMs: 300_000,
  });
}

describe('freno de cierre', () => {
  let copy = '';
  beforeAll(async () => {
    copy = await copyProject();
  });
  afterAll(() => removeCopy(copy));

  it('[CA-007] con la red en rojo, el freno de cierre devuelve el resumen y manda a seguir trabajando; el segundo intento pasa', async () => {
    const { revert } = applySabotage(1, copy);
    try {
      const first = await brake(copy, false);
      expect(first.code, first.stderr).toBe(2);
      expect(first.stderr).toContain('Freno de cierre');
      expect(first.stderr).toMatch(/^ROJO · /m);
      expect(first.stderr).toContain('día de estudio');

      const second = await brake(copy, true);
      expect(second.code).toBe(0);
    } finally {
      revert();
    }
  });

  it('[CA-007] con la red en verde, el freno deja terminar, y si nada cambió desde la última corrida verde ni siquiera la vuelve a correr', async () => {
    const first = await brake(copy, false);
    expect(first.code, first.stderr).toBe(0);
    const lastGreen = join(copy, '.cache', 'red', 'ultima-verde.json');
    const before = readFileSync(lastGreen, 'utf8');

    const second = await brake(copy, false);
    expect(second.code, second.stderr).toBe(0);
    expect(readFileSync(lastGreen, 'utf8')).toBe(before);
  });
});
