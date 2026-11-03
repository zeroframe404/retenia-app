import { join } from 'node:path';
import { type Clock, demoClock } from '../../src/core/clock';
import { newId } from '../../src/data/ids';
import { openWorkspace, type Workspace } from '../../src/data/workspace';
import { tempDataFolder } from './base';

// Un espacio de trabajo real (carpeta de datos propia, base y copias) para las pruebas de
// integración de la organización. Se cierra y se borra al terminar cada prueba.

export interface Space {
  workspace: Workspace;
  dataDir: string;
  file: string;
  clock: Clock;
  // Cierra y vuelve a abrir la misma carpeta, como al cerrar y abrir Retenia.
  reopen: () => Workspace;
}

const folders: ReturnType<typeof tempDataFolder>[] = [];
const open: Workspace[] = [];

export function openSpace({ clock = demoClock() }: { clock?: Clock } = {}): Space {
  const folder = tempDataFolder();
  folders.push(folder);
  const dataDir = folder.folder;
  const start = () => {
    const workspace = openWorkspace({ dataDir, clock, appVersion: '0.0.0-prueba' });
    open.push(workspace);
    return workspace;
  };
  const space: Space = {
    workspace: start(),
    dataDir,
    file: join(dataDir, 'retenia.db'),
    clock,
    reopen: () => {
      space.workspace.close();
      space.workspace = start();
      return space.workspace;
    },
  };
  return space;
}

export function closeSpaces(): void {
  for (const workspace of open.splice(0)) {
    workspace.close();
  }
  for (const folder of folders.splice(0)) {
    folder.remove();
  }
}

// Un renglón de texto (vacío si no se escribe nada), con su identificador como lo arma la ventana.
export function line(
  text: string,
  {
    parentId = null,
    id = newId(),
    collapsed = false,
  }: {
    parentId?: string | null;
    id?: string | undefined;
    collapsed?: boolean;
  } = {},
) {
  return {
    id,
    parentId,
    collapsed,
    content: text === '' ? [] : [{ type: 'text' as const, text }],
  };
}

// Un PNG de un píxel (verdadero: pasa la comprobación de los primeros bytes). Con `variant` sale
// otro archivo distinto, con otra huella.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export function pngBytes(variant = 0): Uint8Array<ArrayBuffer> {
  return new Uint8Array(variant === 0 ? PNG_1X1 : Buffer.concat([PNG_1X1, Buffer.from([variant])]));
}
