import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyProject, removeCopy, runNetworkIn, verdictLines } from '../apoyo/red';
import { applySabotage } from '../sabotage/sabotajes.mjs';

describe('sabotaje 4', () => {
  let copy = '';
  beforeAll(async () => {
    copy = await copyProject();
  });
  afterAll(() => removeCopy(copy));

  it('[CA-006] sabotaje 4: si la ventana importa directamente la base de datos la red da ROJO nombrando «capas», y al revertir vuelve a VERDE', async () => {
    const { revert } = applySabotage(4, copy);
    const red = verdictLines((await runNetworkIn(copy)).stdout);
    expect(red[0], red.join('\n')).toMatch(/^ROJO · /);
    expect(red.join('\n')).toContain('capas');

    revert();
    const green = verdictLines((await runNetworkIn(copy)).stdout);
    expect(green[0], green.join('\n')).toMatch(/^VERDE · /);
  });
});
