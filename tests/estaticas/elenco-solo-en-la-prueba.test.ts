import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectFiles } from '../../tools/lib/archivos.mjs';
import { ROOT } from '../../tools/lib/proceso.mjs';

// El elenco de ejemplo (materias, notas, imagen) y el cambio de datos de la demostración son de la
// variante de prueba: solo `src/main/demo` los define y solo `src/main/index.ts`, detrás de
// `__VARIANTE__ === 'prueba'`, los usa. Así el empaquetador los descarta de la versión real.

const DEMO_ONLY = /seedDemoOrganization|createDemoWorkspace|materias\.json|campana\.png/;

describe('el elenco no se cuela en el código de la versión real', () => {
  it('nada fuera de src/main/demo y de src/main/index.ts nombra la siembra del elenco ni su archivo', async () => {
    const files = (await projectFiles(ROOT)).filter(
      (path) => path.startsWith('src/') && /\.(ts|tsx)$/.test(path),
    );
    expect(files.length).toBeGreaterThan(20);
    const leaks = files
      .filter((path) => !path.startsWith('src/main/demo/') && path !== 'src/main/index.ts')
      .filter((path) => DEMO_ONLY.test(readFileSync(join(ROOT, path), 'utf8')));
    expect(leaks).toEqual([]);
  });

  it('src/main/index.ts solo llama a la demostración detrás de la variante de prueba', async () => {
    const source = readFileSync(join(ROOT, 'src', 'main', 'index.ts'), 'utf8');
    const lines = source.split('\n');
    const uses = lines.flatMap((text, index) =>
      /seedDemoOrganization|createDemoWorkspace/.test(text) &&
      !text.trimStart().startsWith('import ')
        ? [index]
        : [],
    );
    for (const index of uses) {
      const before = lines.slice(Math.max(0, index - 6), index + 1).join('\n');
      expect(before, `línea ${index + 1}`).toMatch(/__VARIANTE__ === 'prueba'|isTest/);
    }
  });
});
