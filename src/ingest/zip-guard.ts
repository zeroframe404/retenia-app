import yauzl from 'yauzl';

// Antes de abrir un comprimido (un Word es un comprimido), se lo revisa entero sin escribir nada al
// disco (docs/arquitectura.md, sección 4): nombres que suben de carpeta, absolutos, con unidad o
// con barras invertidas; entradas cifradas; demasiadas entradas; demasiado contenido descomprimido
// (contado al leer, no por lo que declara el comprimido); y partes con declaraciones de tipo o
// entidades, que podrían apuntar a archivos de la PC. Lo reusa la importación de la Fase 15.

const MAX_ENTRIES = 2000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

export class ZipRejectedError extends Error {
  constructor(reason: string) {
    super(`Comprimido rechazado: ${reason}`);
    this.name = 'ZipRejectedError';
  }
}

const BAD_NAME = /(^|[\\/])\.\.([\\/]|$)|^[\\/]|^[a-zA-Z]:|\\/;
const hasNul = (name: string) => name.includes(String.fromCharCode(0));
// Se revisan todas las partes, se llamen como se llamen (el documento puede nombrar como principal
// una parte sin «.xml»). En las imágenes (una SVG es texto) solo se rechazan las entidades: Word
// guarda dibujos con su declaración de tipo, que sola no apunta a nada.
const IMAGE = /\.(png|jpe?g|gif|bmp|emf|wmf|tiff?|ico|webp|svg)$/i;
const FORBIDDEN = /<!(DOCTYPE|ENTITY)/i;
const FORBIDDEN_IN_IMAGES = /<!ENTITY/i;

export interface ZipSummary {
  entries: string[];
  uncompressedBytes: number;
}

function openBuffer(buffer: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) =>
        error || !zip
          ? reject(new ZipRejectedError(String(error?.message ?? 'no se pudo abrir')))
          : resolve(zip),
    );
  });
}

export async function inspectZip(buffer: Buffer): Promise<ZipSummary> {
  const zip = await openBuffer(buffer);
  const entries: string[] = [];
  let total = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (reason: string) => {
        zip.close();
        reject(new ZipRejectedError(reason));
      };
      zip.on('error', (error: Error) => fail(error.message));
      zip.on('end', () => resolve());
      zip.on('entry', (entry: yauzl.Entry) => {
        const name = entry.fileName;
        if (BAD_NAME.test(name) || hasNul(name)) {
          fail(`un nombre que sale de la carpeta: ${name}`);
          return;
        }
        if (entry.isEncrypted()) {
          fail('una entrada cifrada');
          return;
        }
        entries.push(name);
        if (entries.length > MAX_ENTRIES) {
          fail('demasiadas entradas');
          return;
        }
        if (name.endsWith('/')) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {
            fail(String(error?.message ?? 'una entrada que no se pudo leer'));
            return;
          }
          const forbidden = IMAGE.test(name) ? FORBIDDEN_IN_IMAGES : FORBIDDEN;
          let tail = '';
          let stopped = false;
          stream.on('data', (chunk: Buffer) => {
            if (stopped) {
              return;
            }
            total += chunk.length;
            if (total > MAX_UNCOMPRESSED_BYTES) {
              stopped = true;
              stream.destroy();
              fail('demasiado contenido descomprimido');
              return;
            }
            const text = tail + chunk.toString('latin1');
            if (forbidden.test(text)) {
              stopped = true;
              stream.destroy();
              fail(`un XML con declaraciones de tipo o entidades: ${name}`);
              return;
            }
            tail = text.slice(-16);
          });
          stream.on('error', (streamError: Error) => {
            if (!stopped) {
              stopped = true;
              fail(streamError.message);
            }
          });
          stream.on('end', () => {
            if (!stopped) {
              zip.readEntry();
            }
          });
        });
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  return { entries, uncompressedBytes: total };
}
