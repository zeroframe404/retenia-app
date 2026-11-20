import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createTransfersService, type TransfersService } from '../../src/main/imports/service';
import { runTransferTask } from '../../src/main/workers/transfers-tasks';
import type { Space } from './espacio';

// La importación y la exportación (Fase 15) con el proceso de trabajo corriendo en el mismo proceso
// de la prueba: el mismo código que corre en el proceso aislado «transfers».

export const SAMPLES_DIR = resolve(import.meta.dirname, '..', '..', 'datos-de-ejemplo');
export const sample = (name: string) => join(SAMPLES_DIR, name);

const folders: string[] = [];

// Una carpeta propia de la prueba, fuera de la carpeta de datos (como el Escritorio).
export function outsideFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), 'retenia-afuera-'));
  folders.push(folder);
  return folder;
}

export function writeOutside(name: string, data: Buffer | string): string {
  const file = join(outsideFolder(), name);
  writeFileSync(file, data);
  return file;
}

export function removeOutsideFolders(): void {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
}

// `maxBytes`: un tope chico de lo que se descomprime, para probar el corte sin armar un archivo de
// más de un gigabyte.
export function openTransfers(
  space: Pick<Space, 'workspace' | 'clock'>,
  { maxBytes }: { maxBytes?: number } = {},
): TransfersService {
  return createTransfersService({
    workspace: space.workspace,
    clock: space.clock,
    execute: (task) => runTransferTask(task),
    ...(maxBytes === undefined ? {} : { limits: { maxBytes } }),
  });
}

// La vista previa de un archivo; falla la prueba si el archivo no se pudo leer.
export async function previewOf(
  transfers: TransfersService,
  kind: 'anki' | 'remnote',
  path: string,
) {
  const outcome = await transfers.preview({ kind, path });
  if (outcome.outcome !== 'preview') {
    throw new Error(`No hubo vista previa: ${outcome.problem}`);
  }
  return outcome.preview;
}
