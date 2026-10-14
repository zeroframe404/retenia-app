import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyProject, removeCopy, runNetworkIn, verdictLines } from '../apoyo/red';
import { applySabotage } from '../sabotage/sabotajes.mjs';

describe('sabotaje 3', () => {
  let copy = '';
  beforeAll(async () => {
    copy = await copyProject();
  });
  afterAll(() => removeCopy(copy));

  it('[CA-005] sabotaje 3: con una prueba salteada la red da ROJO con «1 salteada», y al revertir vuelve a VERDE', async () => {
    const { revert } = applySabotage(3, copy);
    const red = verdictLines((await runNetworkIn(copy)).stdout);
    expect(red[0], red.join('\n')).toMatch(/^ROJO · /);
    expect(red.join('\n')).toContain('1 salteada');

    revert();
    const green = verdictLines((await runNetworkIn(copy)).stdout);
    expect(green[0], green.join('\n')).toMatch(/^VERDE · /);
  });
});
