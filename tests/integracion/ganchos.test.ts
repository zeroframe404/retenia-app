import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { correr, RAIZ } from '../../tools/lib/proceso.mjs';
import { entornoLimpio } from '../apoyo/red';

const carpeta = mkdtempSync(join(tmpdir(), 'retenia-ganchos-'));
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

describe('ganchos', () => {
  it('[CA-004] el gancho de commit frena un archivo con una clave y deja pasar uno limpio', async () => {
    const conClave = join(carpeta, 'ajustes.json');
    // La clave se arma en el momento para que no quede escrita en el repositorio.
    const clave = `sk-ant-${'api03'}-${'GanchoDePruebaNoReal'.repeat(4)}${'y'.repeat(13)}AA`;
    writeFileSync(conClave, `${JSON.stringify({ clave }, null, 2)}\n`);
    const limpio = join(carpeta, 'limpio.json');
    writeFileSync(limpio, '{ "tema": "oscuro" }\n');

    const frenado = await correr(
      process.execPath,
      [join(RAIZ, 'tools', 'hooks', 'secretos.mjs'), conClave],
      {
        env: entornoLimpio(),
      },
    );
    expect(frenado.codigo).toBe(1);
    expect(frenado.errores).toContain('Commit frenado: encontré un posible secreto');
    expect(frenado.errores).toContain('anthropic');
    expect(frenado.errores).not.toContain(clave);

    const pasa = await correr(
      process.execPath,
      [join(RAIZ, 'tools', 'hooks', 'secretos.mjs'), limpio],
      {
        env: entornoLimpio(),
      },
    );
    expect(pasa.codigo).toBe(0);
  });

  it('[CA-007] el freno de cierre deja pasar el segundo intento (stop_hook_active) sin correr nada', async () => {
    const r = await correr(process.execPath, [join(RAIZ, 'tools', 'hooks', 'stop.mjs')], {
      env: entornoLimpio(),
      entrada: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: true }),
      limiteMs: 10_000,
    });
    expect(r.codigo).toBe(0);
    expect(r.errores).toBe('');
  });
});
