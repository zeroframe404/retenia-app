import { cpSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { demoClock } from '../../src/core/clock';
import { openWorkspace } from '../../src/data/workspace';
import {
  seedDemoCardCast,
  seedDemoMaterials,
  seedDemoOrganization,
} from '../../src/main/demo/seed';
import { tempDataFolder } from './base';
import { sharedTemplate } from './plantillas';

// Los archivos de ejemplo (los materiales del elenco completo). La ruta va acá y no se toma de
// tests/apoyo/materiales.ts: ese archivo carga la lectura de materiales entera (pdf.js y lo demás)
// y cada archivo de pruebas que abre una base la pagaba sin usarla.
const SAMPLES = resolve(import.meta.dirname, '..', '..', 'datos-de-ejemplo');

// El elenco de ejemplo (materias, notas y 192 tarjetas con su historial) tarda casi medio segundo en
// sembrarse. Las pruebas que solo lo necesitan como punto de partida lo reciben ya sembrado: se
// siembra una sola vez por corrida, en una carpeta de datos aparte, y cada prueba arranca con una
// copia (la base y sus imágenes). Es el mismo elenco, sembrado por el mismo código.

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
  // Una sola vez por corrida (tests/apoyo/plantillas.ts), no una vez por archivo de pruebas.
  const folder = sharedTemplate(`elenco-${kind}`, () => {
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
    return { folder: dirname(data.file), remove: data.remove };
  });
  templates.set(kind, folder);
  return folder;
}

// Copia el elenco sembrado adentro de una carpeta de datos nueva (todavía sin abrir).
export function copyCastInto(folder: string, kind: CastKind = 'completo'): void {
  cpSync(castFolder(kind), folder, { recursive: true });
}
