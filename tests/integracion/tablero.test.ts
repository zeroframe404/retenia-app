import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { archivosDelProyecto } from '../../tools/lib/archivos.mjs';
import { correr, RAIZ } from '../../tools/lib/proceso.mjs';
import { entornoLimpio } from '../apoyo/red';

const ESTADOS = ['Comprobado', 'Con fallas', 'Con salteadas', 'Faltan corridas', 'Sin prueba'];

describe('tablero', () => {
  const salida = mkdtempSync(join(tmpdir(), 'retenia-tablero-'));
  afterAll(() => rmSync(salida, { recursive: true, force: true }));

  it('[CA-008] «npm run tablero» arma una página en castellano con cada historia, sus criterios y el estado de sus pruebas, sin nombres de archivos', async () => {
    const r = await correr(
      process.execPath,
      [join(RAIZ, 'tools', 'dashboard.mjs'), '--sin-abrir', '--salida', salida],
      { env: entornoLimpio(), limiteMs: 60_000 },
    );
    expect(r.codigo).toBe(0);
    const html = readFileSync(join(salida, 'index.html'), 'utf8');

    expect(html).toContain('<html lang="es-AR">');
    expect(html).toContain('<title>Tablero de Retenia</title>');
    for (const seccion of [
      'Estado de la red',
      'Historias, criterios y pruebas',
      'Tablas de casos: lo esperado y lo obtenido',
      'Cobertura de reglas',
      'Mutación',
      'Seguridad',
      'Accesibilidad',
      'Rendimiento',
    ]) {
      expect(html).toContain(`>${seccion}</h2>`);
    }

    // Todas las historias, y la de la red con sus 8 criterios, cada uno con su estado.
    for (let n = 1; n <= 74; n++) {
      expect(html).toContain(`H-${String(n).padStart(2, '0')}`);
    }
    expect(html).toContain('id="h-H-01"');
    for (let n = 1; n <= 8; n++) {
      const id = `CA-00${n}`;
      const encabezado = new RegExp(
        `<h4 id="t-${id}">${id} <span class="chip [a-z-]+">([^<]+)</span>`,
      );
      const estado = encabezado.exec(html)?.[1];
      expect(ESTADOS, `estado de ${id}`).toContain(estado);
    }

    // Ningún nombre de archivo del proyecto ni rutas de carpetas.
    const texto = html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ');
    const nombres = new Set((await archivosDelProyecto(RAIZ)).map((a: string) => basename(a)));
    const encontrados = [...nombres].filter((nombre) => texto.includes(nombre));
    expect(encontrados).toEqual([]);
    expect(texto).not.toMatch(/\b(src|tests|tools|docs)[\\/]/);
    expect(texto).not.toMatch(/\.(tsx?|mjs|cjs|json|ya?ml)\b/);
  });
});
