import { closeSync, constants, openSync } from 'node:fs';

// Un archivo tomado por otro programa, como lo dejan a veces el antivirus o el indexador de
// Windows: se abre sin compartirlo con nadie (ni para leer ni para borrar) hasta soltarlo. Es
// Windows de verdad, no un doble: mientras está tomado, nadie lo puede borrar, tampoco este
// mismo proceso.
export interface HeldFile {
  release(): void;
}

// La marca de libuv para abrir en Windows sin compartir el archivo (UV_FS_O_EXLOCK); Node no la
// trae entre sus constantes.
const EXCLUSIVE = 0x10000000;

export function holdFile(path: string): HeldFile {
  const descriptor = openSync(path, constants.O_RDWR | EXCLUSIVE);
  return { release: () => closeSync(descriptor) };
}
