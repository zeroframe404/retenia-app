import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import yauzl from 'yauzl';

// Busca una clave (o un pedazo de ella) en archivos y carpetas: la carpeta de datos de Retenia
// entera (también lo que guarda Chromium ahí), las copias (que están comprimidas: se abren) y las
// exportaciones (comprimidos .zip: se abre cada archivo de adentro). Busca el texto tal cual y
// también escrito de a dos bytes por letra (UTF-16), que es como Windows guarda muchos textos.
// La usan las pruebas de CA-168 y `node tools/buscar-clave.mjs`.

function patterns(secret) {
  return [Buffer.from(secret, 'utf8'), Buffer.from(secret, 'utf16le')];
}

function contains(data, secret) {
  return patterns(secret).some((pattern) => data.indexOf(pattern) !== -1);
}

function zipEntries(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(error ?? new Error('No se pudo abrir el comprimido'));
        return;
      }
      const entries = [];
      zip.on('entry', (entry) => {
        if (entry.fileName.endsWith('/')) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            reject(streamError ?? new Error('No se pudo leer una parte del comprimido'));
            return;
          }
          const chunks = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            entries.push({ name: entry.fileName, data: Buffer.concat(chunks) });
            zip.readEntry();
          });
          stream.on('error', reject);
        });
      });
      zip.on('end', () => resolve(entries));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

function filesUnder(path) {
  const info = statSync(path, { throwIfNoEntry: false });
  if (!info) {
    return [];
  }
  if (!info.isDirectory()) {
    return [path];
  }
  return readdirSync(path).flatMap((name) => filesUnder(join(path, name)));
}

// Devuelve dónde aparece: `{ file, inside }` (`inside`, el archivo de adentro de un comprimido).
export async function findSecret(secret, paths) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('Hace falta el texto que hay que buscar');
  }
  const found = [];
  for (const file of paths.flatMap(filesUnder)) {
    let data;
    try {
      data = readFileSync(file);
    } catch {
      // Un archivo que Windows tiene tomado (la base abierta, por ejemplo) se lee la próxima vez.
      found.push({ file, inside: null, unreadable: true });
      continue;
    }
    if (contains(data, secret)) {
      found.push({ file, inside: null });
    }
    if (data.length > 2 && data[0] === 0x1f && data[1] === 0x8b) {
      try {
        if (contains(gunzipSync(data), secret)) {
          found.push({ file, inside: '(comprimido)' });
        }
      } catch {
        // No era un comprimido entero: ya se buscó tal cual.
      }
    }
    if (data.length > 4 && data.readUInt32LE(0) === 0x04034b50) {
      for (const entry of await zipEntries(file)) {
        if (contains(entry.data, secret)) {
          found.push({ file, inside: entry.name });
        }
      }
    }
  }
  return found;
}
