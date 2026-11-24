import { cpSync } from 'node:fs';
import { dirname } from 'node:path';
import { demoClock } from '../../src/core/clock';
import { openWorkspace } from '../../src/data/workspace';
import {
  seedDemoCardCast,
  seedDemoMaterials,
  seedDemoOrganization,
} from '../../src/main/demo/seed';
import { tempDataFolder } from './base';
import { SAMPLES } from './materiales';

// El elenco de ejemplo (materias, notas y 192 tarjetas con su historial) tarda casi medio segundo en
// sembrarse. Las pruebas que solo lo necesitan como punto de partida lo reciben ya sembrado: se
// siembra una sola vez por proceso de pruebas, en una carpeta de datos aparte, y cada prueba
// arranca con una copia (la base y sus imágenes). Es el mismo elenco, sembrado por el mismo código.

// `completo`: materias, notas, materiales y tarjetas (las tarjetas citan los materiales).
// `tarjetas`: materias, notas y tarjetas sin materiales, como `seedDemoOrganization` y
// `seedDemoCardCast` con el reloj de la demostración (lo que siembran las pruebas de la sesión y
// de la carga).
export type CastKind = 'completo' | 'tarjetas';

const templates = new Map<CastKind, string>();

function castFolder(kind: CastKind): string {
  const known = templates.get(kind);
  if (known !== undefined) {
    return known;
  }
  const data = tempDataFolder();
  const workspace = openWorkspace({
    dataDir: data.folder,
    clock: demoClock(),
    appVersion: '0.0.0-prueba',
  });
  seedDemoOrganization(workspace);
  if (kind === 'completo') {
    seedDemoCardCast(workspace, seedDemoMaterials(workspace, SAMPLES));
  } else {
    seedDemoCardCast(workspace);
  }
  workspace.close();
  const folder = dirname(data.file);
  templates.set(kind, folder);
  process.on('exit', () => data.remove());
  return folder;
}

// Copia el elenco sembrado adentro de una carpeta de datos nueva (todavía sin abrir).
export function copyCastInto(folder: string, kind: CastKind = 'completo'): void {
  cpSync(castFolder(kind), folder, { recursive: true });
}
