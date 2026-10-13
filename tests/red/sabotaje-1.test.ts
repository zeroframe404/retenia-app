import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { borrarCopia, copiarProyecto, redEn, veredicto } from '../apoyo/red';
import { aplicarSabotaje } from '../sabotage/sabotajes.mjs';

describe('sabotaje 1', () => {
  let copia = '';
  beforeAll(async () => {
    copia = await copiarProyecto();
  });
  afterAll(() => borrarCopia(copia));

  it('[CA-003] sabotaje 1: con el día de estudio cortando a las 00:00 la red da ROJO nombrando «día de estudio», y al revertir vuelve a VERDE', async () => {
    const { revertir } = aplicarSabotaje(1, copia);
    const rojo = veredicto((await redEn(copia)).salida);
    expect(rojo[0]).toMatch(
      /^ROJO · \d+ fallas? · copiá desde acá hasta el final y pegáselo a Claude Code$/,
    );
    expect(rojo.join('\n')).toContain('día de estudio');

    revertir();
    const verde = veredicto((await redEn(copia)).salida);
    expect(verde[0]).toMatch(/^VERDE · /);
  });
});
