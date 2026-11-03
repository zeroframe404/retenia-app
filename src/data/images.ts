import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import type { IMAGE_TYPES } from '../preload/contract/notes';
import type { ReteniaDatabase } from './database';
import { newId } from './ids';
import { ImageNotFoundError, InvalidImageError } from './organization-errors';
import { images } from './schema';

type ImageType = (typeof IMAGE_TYPES)[number];

export interface ImagesStore {
  save(input: { bytes: Uint8Array; mime: ImageType; width: number; height: number }): {
    sha: string;
  };
  read(input: { sha: string }): { mime: ImageType; bytes: Uint8Array<ArrayBuffer> };
}

const startsWith = (bytes: Uint8Array, head: readonly number[], offset = 0) =>
  bytes.length >= offset + head.length &&
  head.every((byte, index) => bytes[offset + index] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

// Los primeros bytes tienen que ser los del tipo que dice el archivo: un SVG, un ejecutable o
// cualquier otra cosa con nombre de imagen no entra.
const SIGNATURES: Record<ImageType, (bytes: Uint8Array) => boolean> = {
  'image/png': (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  'image/gif': (bytes) => startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a')),
  'image/webp': (bytes) => startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8),
};

// Escribe el archivo entero o nada: primero uno temporal en la misma carpeta y después se renombra.
function writeWhole(target: string, bytes: Uint8Array): void {
  const temporary = `${target}.${newId()}.tmp`;
  const descriptor = openSync(temporary, 'w');
  try {
    writeSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    renameSync(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

// Las imágenes de las notas (CA-372): el archivo vive en `imagenes\<sha256>` de la carpeta de
// datos, así la misma imagen pegada dos veces es una sola.
export function createImagesStore(db: ReteniaDatabase, dataDir: string, clock: Clock): ImagesStore {
  const { orm } = db;
  const folder = join(dataDir, 'imagenes');

  return {
    save({ bytes, mime, width, height }) {
      if (!SIGNATURES[mime](bytes)) {
        throw new InvalidImageError();
      }
      const sha = createHash('sha256').update(bytes).digest('hex');
      mkdirSync(folder, { recursive: true });
      const file = join(folder, sha);
      if (!existsSync(file)) {
        writeWhole(file, bytes);
      }
      orm
        .insert(images)
        .values({
          id: newId(),
          sha256: sha,
          mime,
          bytes: bytes.length,
          width,
          height,
          createdAt: clock.now().toISOString(),
        })
        .onConflictDoNothing({ target: images.sha256 })
        .run();
      return { sha };
    },

    read({ sha }) {
      const row = orm.select().from(images).where(eq(images.sha256, sha)).get();
      if (!row) {
        throw new ImageNotFoundError();
      }
      try {
        return {
          mime: row.mime as ImageType,
          bytes: Uint8Array.from(readFileSync(join(folder, sha))),
        };
      } catch {
        throw new ImageNotFoundError();
      }
    },
  };
}
