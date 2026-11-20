import { realpathSync } from 'node:fs';
import { sep } from 'node:path';
import { MIME, type OriginalExtension, originalPath } from './originals';

// «retenia-original://<material>» (docs/arquitectura.md, sección 4): la ventana pide el original de
// un material por su identificador, y el principal lo resuelve a un archivo de `originales\`. Nunca
// acepta rutas: la dirección tiene que ser exactamente el identificador (con o sin «/» al final),
// sin nada más. La ruta real del archivo tiene que estar dentro de la carpeta de datos (un enlace
// que salga de ahí no se sigue).

export const ORIGINAL_SCHEME = 'retenia-original';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function resolveOriginal(
  url: string,
  lookup: (materialId: string) => { sha256: string; ext: OriginalExtension } | null,
  dataDir: string,
): { file: string; mime: string } | null {
  const match = /^retenia-original:\/\/([^/?#]*)\/?$/.exec(url);
  const materialId = match?.[1] ?? '';
  if (!UUID.test(materialId)) {
    return null;
  }
  const found = lookup(materialId);
  if (!found) {
    return null;
  }
  const file = originalPath(`${dataDir}${sep}originales`, found.sha256, found.ext);
  if (file === null) {
    return null;
  }
  try {
    const real = realpathSync.native(file);
    const root = realpathSync.native(dataDir);
    if (!real.toLowerCase().startsWith(`${root.toLowerCase()}${sep}originales${sep}`)) {
      return null;
    }
    return { file: real, mime: MIME[found.ext] };
  } catch {
    return null;
  }
}

// Un pedido por rangos («Range: bytes=…»): el tramo pedido dentro del archivo, null si no se pidió
// rango, o 'invalid' si no se puede servir (se contesta 416).
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null | 'invalid' {
  if (header === null) {
    return null;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) {
    return 'invalid';
  }
  let start: number;
  let end: number;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return 'invalid';
  }
  return { start, end };
}
