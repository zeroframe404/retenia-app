import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import yauzl from 'yauzl';

// Los comprimidos que se importan (Fase 15: un .apkg de Anki, una exportación de RemNote o de
// Retenia), leídos por partes en el proceso aislado. Antes de escribir nada se revisa cada nombre
// (que no suba de carpeta, que no sea absoluto, sin unidad ni barras invertidas ni caracteres nulos),
// que no haya entradas cifradas, enlaces ni nombres repetidos, y se cuentan las entradas y lo que se
// descomprime al leer (no lo que declara el comprimido). Cada entrada va a un archivo propio dentro
// de la carpeta de trabajo, nunca a la ruta que dice el comprimido.

export class NotAZipError extends Error {
  constructor() {
    super('No es un comprimido');
    this.name = 'NotAZipError';
  }
}

export class UnsafeZipError extends Error {
  constructor(reason: string) {
    super(`Comprimido rechazado: ${reason}`);
    this.name = 'UnsafeZipError';
  }
}

export interface ZipLimits {
  maxEntries: number;
  // Lo que se descomprime en total, contado al leer.
  maxBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 20_000,
  maxBytes: 4 * 1024 * 1024 * 1024,
};

const BAD_NAME = /(^|[\\/])\.\.([\\/]|$)|^[\\/]|^[a-zA-Z]:|\\/;
const SYMLINK = 0o120000;
const FILE_TYPE = 0o170000;

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      path,
      {
        lazyEntries: true,
        decodeStrings: true,
        validateEntrySizes: true,
        strictFileNames: true,
        autoClose: false,
      },
      (error, zip) => (error || !zip ? reject(new NotAZipError()) : resolve(zip)),
    );
  });
}

// Lee el comprimido entero: devuelve, por nombre, el archivo de la carpeta de trabajo con su
// contenido. `wanted` decide qué entradas se guardan (las demás se revisan igual, sin escribirlas);
// `keepPaths` guarda cada una con su propia ruta (ya revisada) en vez de un número.
export async function extractZip(
  path: string,
  outDir: string,
  {
    limits = DEFAULT_ZIP_LIMITS,
    wanted = () => true,
    keepPaths = false,
  }: { limits?: ZipLimits; wanted?: (name: string) => boolean; keepPaths?: boolean } = {},
): Promise<Map<string, string>> {
  const zip = await openZip(path);
  const files = new Map<string, string>();
  const seen = new Set<string>();
  let count = 0;
  let total = 0;
  mkdirSync(outDir, { recursive: true });
  try {
    await new Promise<void>((resolve, reject) => {
      let failed = false;
      const fail = (error: Error) => {
        if (!failed) {
          failed = true;
          reject(error);
        }
      };
      zip.on('error', (error: Error) => fail(new UnsafeZipError(error.message)));
      zip.on('end', () => {
        if (!failed) {
          resolve();
        }
      });
      zip.on('entry', (entry: yauzl.Entry) => {
        const name = entry.fileName;
        if (BAD_NAME.test(name) || name.includes(String.fromCharCode(0))) {
          fail(new UnsafeZipError(`un nombre que sale de la carpeta: ${name}`));
          return;
        }
        if (entry.isEncrypted()) {
          fail(new UnsafeZipError('una entrada cifrada'));
          return;
        }
        if (((entry.externalFileAttributes >>> 16) & FILE_TYPE) === SYMLINK) {
          fail(new UnsafeZipError('un enlace'));
          return;
        }
        count += 1;
        if (count > limits.maxEntries) {
          fail(new UnsafeZipError('demasiadas entradas'));
          return;
        }
        const folded = name.toLocaleLowerCase('es');
        if (seen.has(folded)) {
          fail(new UnsafeZipError(`un nombre repetido: ${name}`));
          return;
        }
        seen.add(folded);
        if (name.endsWith('/')) {
          zip.readEntry();
          return;
        }
        const keep = wanted(name);
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {
            fail(new UnsafeZipError(String(error?.message ?? 'una entrada que no se pudo leer')));
            return;
          }
          const target = keep
            ? keepPaths
              ? join(outDir, ...name.split('/'))
              : join(outDir, `e${count}`)
            : null;
          if (target) {
            mkdirSync(dirname(target), { recursive: true });
          }
          const sink = target ? createWriteStream(target) : null;
          let stopped = false;
          stream.on('data', (chunk: Buffer) => {
            if (stopped) {
              return;
            }
            total += chunk.length;
            if (total > limits.maxBytes) {
              stopped = true;
              stream.destroy();
              sink?.destroy();
              fail(new UnsafeZipError('demasiado contenido descomprimido'));
            }
          });
          stream.on('error', (streamError: Error) => {
            if (!stopped) {
              stopped = true;
              sink?.destroy();
              fail(new UnsafeZipError(streamError.message));
            }
          });
          if (sink && target) {
            stream.pipe(sink);
            sink.on('error', (sinkError: Error) => fail(sinkError));
            sink.on('finish', () => {
              if (!stopped) {
                files.set(name, target);
                zip.readEntry();
              }
            });
          } else {
            stream.on('end', () => {
              if (!stopped) {
                zip.readEntry();
              }
            });
            stream.resume();
          }
        });
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  return files;
}
