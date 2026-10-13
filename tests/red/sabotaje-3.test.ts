import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { borrarCopia, copiarProyecto, redEn, veredicto } from '../apoyo/red';
import { aplicarSabotaje } from '../sabotage/sabotajes.mjs';

describe('sabotaje 3', () => {
  let copia = '';
  beforeAll(async () => {
    copia = await copiarProyecto();
  });
  afterAll(() => borrarCopia(copia));

  it('[CA-005] sabotaje 3: con una prueba salteada la red da ROJO con «1 salteada», y al revertir vuelve a VERDE', async () => {
    const { revertir } = aplicarSabotaje(3, copia);
    const rojo = veredicto((await redEn(copia)).salida);
    expect(rojo[0], rojo.join('\n')).toMatch(/^ROJO · /);
    expect(rojo.join('\n')).toContain('1 salteada');

    revertir();
    const verde = veredicto((await redEn(copia)).salida);
    expect(verde[0], verde.join('\n')).toMatch(/^VERDE · /);
  });
});
