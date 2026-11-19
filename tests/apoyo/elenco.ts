import { cpSync } from 'node:fs';
import { dirname } from 'node:path';
import { demoClock } from '../../src/core/clock';
import { openWorkspace } from '../../src/data/workspace';
import { seedDemoCardCast, seedDemoOrganization } from '../../src/main/demo/seed';
import { tempDataFolder } from './base';

// El elenco de ejemplo (materias, notas y 192 tarjetas con su historial) tarda casi medio segundo en
// sembrarse. Las pruebas que solo lo necesitan como punto de partida lo reciben ya sembrado: se
// siembra una sola vez por proceso de pruebas, en una carpeta de datos aparte, y cada prueba
// arranca con una copia (la base y sus imágenes). Es el mismo elenco, sembrado por el mismo código.

let template: { file: string } | null = null;

function castFolder(): string {
  if (template === null) {
    const data = tempDataFolder();
    const workspace = openWorkspace({
      dataDir: data.folder,
      clock: demoClock(),
      appVersion: '0.0.0-prueba',
    });
    seedDemoOrganization(workspace);
    seedDemoCardCast(workspace);
    workspace.close();
    template = { file: data.file };
    process.on('exit', () => data.remove());
  }
  return dirname(template.file);
}

// Copia el elenco sembrado adentro de una carpeta de datos nueva (todavía sin abrir).
export function copyCastInto(folder: string): void {
  cpSync(castFolder(), folder, { recursive: true });
}
