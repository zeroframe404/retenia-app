import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyProject, removeCopy, runNetworkIn, verdictLines } from '../apoyo/red';
import { applySabotage } from '../sabotage/sabotajes.mjs';

describe('sabotaje 1', () => {
  let copy = '';
  beforeAll(async () => {
    copy = await copyProject();
  });
  afterAll(() => removeCopy(copy));

  it('[CA-003] sabotaje 1: con el día de estudio cortando a las 00:00 la red da ROJO nombrando «día de estudio», y al revertir vuelve a VERDE', async () => {
    const { revert } = applySabotage(1, copy);
    const red = verdictLines((await runNetworkIn(copy)).stdout);
    expect(red[0], red.join('\n')).toMatch(
      /^ROJO · \d+ fallas? · copiá desde acá hasta el final y pegáselo a Claude Code$/,
    );
    expect(red.join('\n')).toContain('día de estudio');

    revert();
    const green = verdictLines((await runNetworkIn(copy)).stdout);
    expect(green[0], green.join('\n')).toMatch(/^VERDE · /);
  });
});
