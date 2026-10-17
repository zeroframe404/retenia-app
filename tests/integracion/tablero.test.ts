import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { projectFiles } from '../../tools/lib/archivos.mjs';
import { ROOT, run } from '../../tools/lib/proceso.mjs';
import { cleanEnv } from '../apoyo/red';

const STATES = ['Comprobado', 'Con fallas', 'Con salteadas', 'Faltan corridas', 'Sin prueba'];

describe('tablero', () => {
  const output = mkdtempSync(join(tmpdir(), 'retenia-tablero-'));
  afterAll(() => rmSync(output, { recursive: true, force: true }));

  it('[CA-008] «npm run tablero» arma una página en castellano con cada historia, sus criterios y el estado de sus pruebas, sin nombres de archivos', async () => {
    const r = await run(
      process.execPath,
      [join(ROOT, 'tools', 'dashboard.mjs'), '--sin-abrir', '--salida', output],
      { env: cleanEnv(), timeoutMs: 60_000 },
    );
    expect(r.code, r.stderr).toBe(0);
    const html = readFileSync(join(output, 'index.html'), 'utf8');

    expect(html).toContain('<html lang="es-AR">');
    expect(html).toContain('<title>Tablero de Retenia</title>');
    for (const section of [
      'Estado de la red',
      'Historias, criterios y pruebas',
      'Tablas de casos: lo esperado y lo obtenido',
      'Cobertura de reglas',
      'Mutación',
      'Seguridad',
      'Accesibilidad',
      'Rendimiento',
    ]) {
      expect(html).toContain(`>${section}</h2>`);
    }

    // Todas las historias, y la de la red con sus 8 criterios, cada uno con su estado.
    for (let n = 1; n <= 74; n++) {
      expect(html).toContain(`H-${String(n).padStart(2, '0')}`);
    }
    expect(html).toContain('id="h-H-01"');
    for (let n = 1; n <= 8; n++) {
      const id = `CA-00${n}`;
      const heading = new RegExp(
        `<h4 id="t-${id}">${id} <span class="chip [a-z-]+">([^<]+)</span>`,
      );
      expect(STATES, `estado de ${id}`).toContain(heading.exec(html)?.[1]);
    }

    // Ningún nombre de archivo del proyecto ni rutas de carpetas. Los archivos de ejemplo que
    // nombran los criterios (como «Inferencia — capítulos 1 a 4.pdf») son parte de lo que se lee
    // y pueden aparecer, pero solo los que figuran en el elenco (decidido el 17/10/2026).
    const text = html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ');
    const files = await projectFiles(ROOT);
    const samples = new Set(
      files.filter((f) => f.startsWith('datos-de-ejemplo/')).map((f) => basename(f)),
    );
    const shown = [...new Set(files.map((f) => basename(f)))].filter((name) => text.includes(name));
    expect(shown.filter((name) => !samples.has(name))).toEqual([]);
    const cast = readFileSync(join(ROOT, 'docs', 'especificacion', 'elenco.md'), 'utf8');
    expect(shown.filter((name) => !cast.includes(`| ${name} |`))).toEqual([]);
    expect(text).not.toMatch(/\b(src|tests|tools|docs)[\\/]/);
    expect(text).not.toMatch(/\.(tsx?|mjs|cjs|json|ya?ml)\b/);
  });
});
