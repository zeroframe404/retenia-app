import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createDemoDate } from '../../src/main/demo/clock';
import { ROOT, run } from '../../tools/lib/proceso.mjs';
import { cleanEnv } from '../apoyo/red';

const folder = mkdtempSync(join(tmpdir(), 'retenia-datos-'));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

function resetData(dataDir: string) {
  return run(process.execPath, [join(ROOT, 'tools', 'datos-reiniciar.mjs')], {
    env: cleanEnv({ RETENIA_DATOS: dataDir }),
  });
}

describe('datos de demostración', () => {
  it('«npm run datos:reiniciar» deja la carpeta de datos de demostración en su estado conocido', async () => {
    const demo = join(folder, 'demostracion');
    const first = await resetData(demo);
    expect(first.code).toBe(0);
    expect(readdirSync(demo)).toEqual(['LEEME.txt']);

    // Lo que deja Retenia al usarse (cachés de Chromium, una base) se va en el siguiente reinicio.
    mkdirSync(join(demo, 'Cache'));
    writeFileSync(join(demo, 'retenia.db'), 'datos de una sesión');
    const second = await resetData(demo);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain('quedó como nueva');
    expect(readdirSync(demo)).toEqual(['LEEME.txt']);
  });

  it('«npm run datos:reiniciar» también vuelve la fecha de demostración al lunes 15/03/2027 y saca las copias', async () => {
    const demo = join(folder, 'demostracion-con-fecha');
    expect((await resetData(demo)).code).toBe(0);
    // Como queda después de usar Retenia: días sumados con «+7 días» y una copia.
    createDemoDate(demo).advance(7);
    mkdirSync(join(demo, 'copias'));
    writeFileSync(
      join(demo, 'copias', '2027-03-22-1000-hecha-por-vos-0000abcd.retenia-copia'),
      'x',
    );
    expect(createDemoDate(demo).today()).toBe('2027-03-22');

    const r = await resetData(demo);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('la fecha vuelve al lunes 15/03/2027');
    expect(readdirSync(demo)).toEqual(['LEEME.txt']);
    expect(createDemoDate(demo).today()).toBe('2027-03-15');
  });

  it('«npm run datos:reiniciar» no borra una carpeta que no reconoce como de demostración', async () => {
    const other = join(folder, 'otra-cosa');
    mkdirSync(other);
    writeFileSync(join(other, 'importante.txt'), 'no tocar');
    const r = await resetData(other);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('no parece una carpeta de datos de demostración');
    expect(readdirSync(other)).toEqual(['importante.txt']);
  });
});
