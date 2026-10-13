import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { correr } from '../../tools/lib/proceso.mjs';
import { borrarCopia, copiarProyecto, entornoLimpio } from '../apoyo/red';
import { aplicarSabotaje } from '../sabotage/sabotajes.mjs';

function freno(copia: string, stopHookActive: boolean) {
  return correr(process.execPath, [join(copia, 'tools', 'hooks', 'stop.mjs')], {
    cwd: copia,
    env: entornoLimpio(),
    entrada: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: stopHookActive }),
    limiteMs: 300_000,
  });
}

describe('freno de cierre', () => {
  let copia = '';
  beforeAll(async () => {
    copia = await copiarProyecto();
  });
  afterAll(() => borrarCopia(copia));

  it('[CA-007] con la red en rojo, el freno de cierre devuelve el resumen y manda a seguir trabajando; el segundo intento pasa', async () => {
    const { revertir } = aplicarSabotaje(1, copia);
    try {
      const primero = await freno(copia, false);
      expect(primero.codigo).toBe(2);
      expect(primero.errores).toContain('Freno de cierre');
      expect(primero.errores).toMatch(/^ROJO · /m);
      expect(primero.errores).toContain('día de estudio');

      const segundo = await freno(copia, true);
      expect(segundo.codigo).toBe(0);
    } finally {
      revertir();
    }
  });

  it('[CA-007] con la red en verde, el freno deja terminar, y si nada cambió desde la última corrida verde ni siquiera la vuelve a correr', async () => {
    const primero = await freno(copia, false);
    expect(primero.codigo).toBe(0);
    const ultimaVerde = join(copia, '.cache', 'red', 'ultima-verde.json');
    const antes = readFileSync(ultimaVerde, 'utf8');

    const segundo = await freno(copia, false);
    expect(segundo.codigo).toBe(0);
    expect(readFileSync(ultimaVerde, 'utf8')).toBe(antes);
  });
});
