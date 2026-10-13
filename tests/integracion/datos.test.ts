import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { correr, RAIZ } from '../../tools/lib/proceso.mjs';
import { entornoLimpio } from '../apoyo/red';

const carpeta = mkdtempSync(join(tmpdir(), 'retenia-datos-'));
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

describe('datos de demostración', () => {
  it('«npm run datos:reiniciar» deja la carpeta de datos de demostración en su estado conocido', async () => {
    const datos = join(carpeta, 'demostracion');
    mkdirSync(join(datos, 'Cache'), { recursive: true });
    writeFileSync(join(datos, 'retenia.db'), 'datos viejos');

    const r = await correr(process.execPath, [join(RAIZ, 'tools', 'datos-reiniciar.mjs')], {
      env: entornoLimpio({ RETENIA_DATOS: datos }),
    });
    expect(r.codigo).toBe(0);
    expect(r.salida).toContain('quedó como nueva');
    expect(readdirSync(datos)).toEqual(['LEEME.txt']);
  });
});
