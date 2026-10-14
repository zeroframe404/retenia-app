import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Una carpeta de datos propia de cada prueba, en su ruta larga canónica y con la base real
// adentro (archivo temporal, no memoria): se borra al terminar.
export function tempDataFolder(): { folder: string; file: string; remove: () => void } {
  const folder = realpathSync.native(mkdtempSync(join(tmpdir(), 'retenia-datos-')));
  return {
    folder,
    file: join(folder, 'retenia.db'),
    remove: () => rmSync(folder, { recursive: true, force: true }),
  };
}
