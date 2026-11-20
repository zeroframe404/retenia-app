import { realpathSync } from 'node:fs';
import { open, stat } from 'node:fs/promises';
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
  // El HTML de una página web guardada nunca se sirve a la ventana: lo que se ve es su instantánea
  // saneada (Fase 14, CA-120).
  if (!found || found.ext === 'html') {
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

// Lee del disco solo el tramo [start, end] del archivo (un PDF grande no se lee entero por cada
// pedido de pdf.js).
export async function readPart(file: string, start: number, end: number): Promise<Uint8Array> {
  const handle = await open(file, 'r');
  try {
    const length = end - start + 1;
    const buffer = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const { bytesRead } = await handle.read(buffer, read, length - read, start + read);
      if (bytesRead === 0) {
        break;
      }
      read += bytesRead;
    }
    return buffer.subarray(0, read);
  } finally {
    await handle.close();
  }
}

export interface ServedOriginal {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array | null;
}

// La respuesta a un pedido del original. Solo los orígenes de la ventana de Retenia reciben el
// permiso para leerlo (`access-control-allow-origin`); a cualquier otro, el navegador no le deja
// ver la respuesta.
export async function serveOriginal(
  request: { url: string; origin: string | null; range: string | null },
  {
    lookup,
    dataDir,
    allowedOrigins,
    read = readPart,
  }: {
    lookup: (materialId: string) => { sha256: string; ext: OriginalExtension } | null;
    dataDir: string;
    allowedOrigins: readonly string[];
    read?: (file: string, start: number, end: number) => Promise<Uint8Array>;
  },
): Promise<ServedOriginal> {
  const resolved = resolveOriginal(request.url, lookup, dataDir);
  if (!resolved) {
    return { status: 404, headers: {}, body: null };
  }
  const headers: Record<string, string> = {
    'content-type': resolved.mime,
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  };
  if (request.origin !== null && allowedOrigins.includes(request.origin)) {
    headers['access-control-allow-origin'] = request.origin;
    headers.vary = 'origin';
  }
  const { size } = await stat(resolved.file);
  const range = parseRange(request.range, size);
  if (range === 'invalid') {
    return { status: 416, headers: { ...headers, 'content-range': `bytes */${size}` }, body: null };
  }
  if (range === null) {
    return {
      status: 200,
      headers,
      body: size === 0 ? new Uint8Array() : await read(resolved.file, 0, size - 1),
    };
  }
  return {
    status: 206,
    headers: { ...headers, 'content-range': `bytes ${range.start}-${range.end}/${size}` },
    body: await read(resolved.file, range.start, range.end),
  };
}
