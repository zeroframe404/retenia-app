import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { borrarCopia, copiarProyecto, redEn, veredicto } from '../apoyo/red';
import { aplicarSabotaje } from '../sabotage/sabotajes.mjs';

describe('sabotaje 4', () => {
  let copia = '';
  beforeAll(async () => {
    copia = await copiarProyecto();
  });
  afterAll(() => borrarCopia(copia));

  it('[CA-006] sabotaje 4: si la ventana importa directamente la base de datos la red da ROJO nombrando «capas», y al revertir vuelve a VERDE', async () => {
    const { revertir } = aplicarSabotaje(4, copia);
    const rojo = veredicto((await redEn(copia)).salida);
    expect(rojo[0]).toMatch(/^ROJO · /);
    expect(rojo.join('\n')).toContain('capas');

    revertir();
    const verde = veredicto((await redEn(copia)).salida);
    expect(verde[0]).toMatch(/^VERDE · /);
  });
});
