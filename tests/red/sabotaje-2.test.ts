import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { binario, correr } from '../../tools/lib/proceso.mjs';
import { borrarCopia, copiarProyecto, git, redEn, veredicto } from '../apoyo/red';
import { aplicarSabotaje } from '../sabotage/sabotajes.mjs';

describe('sabotaje 2', () => {
  let copia = '';
  beforeAll(async () => {
    copia = await copiarProyecto();
    // Los ganchos de git instalados en la copia, como en tu PC.
    await correr(process.execPath, [binario('lefthook', 'lefthook', copia), 'install'], {
      cwd: copia,
    });
  });
  afterAll(() => borrarCopia(copia));

  it('[CA-004] sabotaje 2: una clave falsa en un archivo frena el commit y la red da ROJO nombrando «secreto», y al revertir vuelve a VERDE', async () => {
    const { archivos, revertir } = aplicarSabotaje(2, copia);

    await git(copia, 'add', ...archivos);
    const commit = await git(copia, 'commit', '-m', 'sabotaje 2');
    expect(commit.codigo).not.toBe(0);
    expect(`${commit.salida}\n${commit.errores}`).toContain('secreto');
    const historial = await git(copia, 'rev-list', '--count', 'HEAD');
    expect(historial.salida.trim()).toBe('1');

    const rojo = veredicto((await redEn(copia)).salida);
    expect(rojo[0]).toMatch(/^ROJO · /);
    expect(rojo.join('\n')).toContain('secreto');

    await git(copia, 'reset', '-q', '--', ...archivos);
    revertir();
    const verde = veredicto((await redEn(copia)).salida);
    expect(verde[0]).toMatch(/^VERDE · /);
  });
});
