import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import yazl from 'yazl';
import { z } from 'zod';
import { buildAnkiPackage } from '../../core/imports/anki';
import { exportIndexSchema } from '../../core/imports/markdown';
import { mediaInfo } from '../../core/imports/media';
import { baseName, type ImportPackage, type PackageMedia } from '../../core/imports/package';
import { decodeProto, ProtobufError } from '../../core/imports/protobuf';
import { buildRemnotePackage, type RemnoteDocument } from '../../core/imports/remnote';
import { AnkiDamagedError, readAnkiCollection } from '../../data/foreign/anki-db';
import {
  DEFAULT_ZIP_LIMITS,
  extractZip,
  NotAZipError,
  UnsafeZipError,
  type ZipLimits,
} from './zip-reader';

// Las tareas del proceso aislado de importar y exportar (Fase 15): leer un mazo de Anki o una
// exportación de RemNote hasta dejar el paquete de Retenia (sin escribir nada en la base), escribir
// el comprimido de «Exportar todo» y revisar el de «Importar exportación». Corre sin red, con tope
// de memoria y de tiempo; lo que viene en los archivos es dato, nunca instrucción.

const limitsSchema = z.strictObject({ maxBytes: z.number().int().positive().optional() });

export const transferTask = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('readAnki'),
    path: z.string().min(1),
    outDir: z.string().min(1),
    limits: limitsSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('readRemnote'),
    path: z.string().min(1),
    outDir: z.string().min(1),
    limits: limitsSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal('writeZip'),
    entries: z.array(z.strictObject({ zipPath: z.string().min(1), from: z.string().min(1) })),
    out: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal('readExport'),
    path: z.string().min(1),
    outDir: z.string().min(1),
    limits: limitsSchema.optional(),
  }),
]);
export type TransferTask = z.input<typeof transferTask>;

export type ReadProblem = 'notAnki' | 'notRemnote' | 'notExport' | 'tooNew' | 'damaged' | 'unsafe';

export type ReadResult =
  | { ok: true; package: ImportPackage; fileSha256: string; fileName: string }
  | { ok: false; problem: ReadProblem };

const ANKI_VERSIONS = {
  1: 'collection.anki2',
  2: 'collection.anki21',
  3: 'collection.anki21b',
} as const;

function zipLimits(limits?: { maxBytes?: number | undefined }): ZipLimits {
  return limits?.maxBytes === undefined
    ? DEFAULT_ZIP_LIMITS
    : { ...DEFAULT_ZIP_LIMITS, maxBytes: limits.maxBytes };
}

async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// Un medio: su huella, su tipo y su tamaño (si es una imagen), guardado en la carpeta de trabajo con
// su huella por nombre.
function describeMedia(bytes: Uint8Array, name: string, outDir: string): PackageMedia {
  const sha = sha256(bytes);
  const target = join(outDir, sha);
  if (!existsSync(target)) {
    writeFileSync(target, bytes);
  }
  const info = mediaInfo(bytes);
  return {
    sha,
    name: name.slice(0, 500) || sha,
    mime: info.mime,
    bytes: bytes.length,
    kind: info.kind === 'audio' ? 'audio' : 'image',
    ...(info.kind === 'image' ? { width: info.width, height: info.height } : {}),
  };
}

function decompress(bytes: Buffer, maxBytes: number): Buffer {
  try {
    return zstdDecompressSync(bytes, { maxOutputLength: maxBytes });
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
      throw new UnsafeZipError('demasiado contenido descomprimido');
    }
    throw new AnkiDamagedError('una parte comprimida ilegible');
  }
}

async function readAnki(task: {
  path: string;
  outDir: string;
  limits?: { maxBytes?: number | undefined } | undefined;
}): Promise<ReadResult> {
  const limits = zipLimits(task.limits);
  const entries = await extractZip(task.path, join(task.outDir, 'partes'), { limits });
  // La versión del paquete: «meta» (protobuf) en el formato actual; si no está, por el nombre de la
  // colección (como hace Anki).
  let version: 1 | 2 | 3;
  const meta = entries.get('meta');
  if (meta) {
    let value: bigint | null;
    try {
      value = decodeProto(readFileSync(meta)).varint(1);
    } catch (error) {
      if (error instanceof ProtobufError) {
        return { ok: false, problem: 'damaged' };
      }
      throw error;
    }
    if (value !== 1n && value !== 2n && value !== 3n) {
      return { ok: false, problem: 'tooNew' };
    }
    version = Number(value) as 1 | 2 | 3;
  } else if (entries.has('collection.anki21b')) {
    version = 3;
  } else if (entries.has('collection.anki21')) {
    version = 2;
  } else if (entries.has('collection.anki2')) {
    version = 1;
  } else {
    return { ok: false, problem: 'notAnki' };
  }
  const collectionEntry = entries.get(ANKI_VERSIONS[version]);
  if (!collectionEntry) {
    return { ok: false, problem: 'damaged' };
  }
  let collectionFile = collectionEntry;
  if (version === 3) {
    collectionFile = join(task.outDir, 'coleccion.db');
    writeFileSync(collectionFile, decompress(readFileSync(collectionEntry), limits.maxBytes));
  }
  const collection = readAnkiCollection(collectionFile);

  // La lista de medios: JSON en los formatos viejos, protobuf (comprimido) en el actual. Los nombres
  // son datos: nunca se usan como rutas.
  const names: string[] = [];
  const mediaEntry = entries.get('media');
  if (mediaEntry) {
    const raw = readFileSync(mediaEntry);
    if (version === 3) {
      try {
        const list = decodeProto(decompress(raw, limits.maxBytes));
        for (const item of list.bytesList(1)) {
          names.push(decodeProto(item).string(1));
        }
      } catch (error) {
        if (error instanceof ProtobufError) {
          return { ok: false, problem: 'damaged' };
        }
        throw error;
      }
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString('utf8') || '{}');
      } catch {
        return { ok: false, problem: 'damaged' };
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, problem: 'damaged' };
      }
      for (const [index, name] of Object.entries(parsed)) {
        if (/^\d+$/.test(index) && typeof name === 'string') {
          names[Number(index)] = name;
        }
      }
    }
  }
  const mediaDir = join(task.outDir, 'medios');
  mkdirSync(mediaDir, { recursive: true });
  const media = new Map<string, PackageMedia>();
  names.forEach((name, index) => {
    const entry = entries.get(String(index));
    if (name === undefined || !entry) {
      return;
    }
    const raw = readFileSync(entry);
    const bytes = version === 3 ? decompress(raw, limits.maxBytes) : raw;
    media.set(name, describeMedia(bytes, name, mediaDir));
  });
  return {
    ok: true,
    package: buildAnkiPackage(collection, media),
    fileSha256: await sha256OfFile(task.path),
    fileName: baseName(task.path),
  };
}

const DOCUMENT = /\.(md|markdown)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;
const decoder = new TextDecoder('utf-8', { fatal: true });

// Los archivos de una carpeta (sin seguir enlaces), con su ruta relativa con «/».
function walk(root: string, limits: ZipLimits): Map<string, string> {
  const found = new Map<string, string>();
  let total = 0;
  const visit = (folder: string) => {
    for (const name of readdirSync(folder)) {
      const full = join(folder, name);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) {
        continue;
      }
      if (stat.isDirectory()) {
        visit(full);
      } else if (stat.isFile()) {
        total += stat.size;
        if (found.size >= limits.maxEntries || total > limits.maxBytes) {
          throw new UnsafeZipError('demasiados archivos');
        }
        found.set(relative(root, full).split('\\').join('/'), full);
      }
    }
  };
  visit(root);
  return found;
}

async function readRemnote(task: {
  path: string;
  outDir: string;
  limits?: { maxBytes?: number | undefined } | undefined;
}): Promise<ReadResult> {
  const limits = zipLimits(task.limits);
  let files: Map<string, string>;
  if (statSync(task.path).isDirectory()) {
    files = walk(task.path, limits);
  } else if (DOCUMENT.test(task.path)) {
    files = new Map([[baseName(task.path), task.path]]);
  } else {
    try {
      files = await extractZip(task.path, join(task.outDir, 'partes'), {
        limits,
        wanted: (name) => DOCUMENT.test(name) || IMAGE.test(name),
      });
    } catch (error) {
      if (error instanceof NotAZipError) {
        return { ok: false, problem: 'notRemnote' };
      }
      throw error;
    }
  }
  const docs: RemnoteDocument[] = [];
  const unreadable: string[] = [];
  const media = new Map<string, PackageMedia>();
  const mediaDir = join(task.outDir, 'medios');
  mkdirSync(mediaDir, { recursive: true });
  const paths = [...files.keys()].sort((a, b) => a.localeCompare(b, 'es'));
  for (const path of paths) {
    const file = files.get(path);
    if (!file) {
      continue;
    }
    if (DOCUMENT.test(path)) {
      try {
        docs.push({ path, text: decoder.decode(readFileSync(file)) });
      } catch {
        unreadable.push(path);
      }
    } else if (IMAGE.test(path)) {
      media.set(path, describeMedia(readFileSync(file), baseName(path), mediaDir));
    }
  }
  if (docs.length === 0 && unreadable.length === 0) {
    return { ok: false, problem: 'notRemnote' };
  }
  const pkg = buildRemnotePackage(docs, media);
  for (const path of unreadable) {
    pkg.rejected.push({ what: path, reason: 'unreadableDocument' });
    pkg.rejectedBy.push('');
  }
  return {
    ok: true,
    package: pkg,
    fileSha256: statSync(task.path).isDirectory()
      ? sha256(Buffer.from(paths.join('\n')))
      : await sha256OfFile(task.path),
    fileName: baseName(task.path),
  };
}

// Lo que ya viene comprimido no se vuelve a comprimir.
const STORED = /\.(png|jpe?g|gif|webp|pdf|docx|mp3|ogg|m4a|zip|apkg)$/i;

async function writeZip(task: {
  entries: { zipPath: string; from: string }[];
  out: string;
}): Promise<{ ok: true }> {
  const zip = new yazl.ZipFile();
  const done = new Promise<void>((resolve, reject) => {
    const sink = createWriteStream(task.out);
    sink.on('close', () => resolve());
    sink.on('error', reject);
    zip.outputStream.on('error', reject);
    zip.outputStream.pipe(sink);
  });
  for (const entry of task.entries) {
    zip.addFile(entry.from, entry.zipPath, { compress: !STORED.test(entry.zipPath) });
  }
  zip.end();
  await done;
  return { ok: true };
}

type ExportReadResult =
  | { ok: true; index: z.output<typeof exportIndexSchema> }
  | { ok: false; problem: ReadProblem };

async function readExport(task: {
  path: string;
  outDir: string;
  limits?: { maxBytes?: number | undefined } | undefined;
}): Promise<ExportReadResult> {
  let files: Map<string, string>;
  try {
    files = await extractZip(task.path, task.outDir, {
      limits: zipLimits(task.limits),
      keepPaths: true,
    });
  } catch (error) {
    if (error instanceof NotAZipError) {
      return { ok: false, problem: 'notExport' };
    }
    throw error;
  }
  const indexFile = files.get('indice.json');
  if (!indexFile) {
    return { ok: false, problem: 'notExport' };
  }
  let parsed: z.output<typeof exportIndexSchema>;
  try {
    parsed = exportIndexSchema.parse(JSON.parse(readFileSync(indexFile, 'utf8')));
  } catch {
    return { ok: false, problem: 'notExport' };
  }
  // Cada archivo del índice está, con su tamaño y su huella.
  for (const listed of parsed.files) {
    const file = files.get(listed.path);
    if (
      !file ||
      statSync(file).size !== listed.bytes ||
      (await sha256OfFile(file)) !== listed.sha256
    ) {
      return { ok: false, problem: 'damaged' };
    }
  }
  return { ok: true, index: parsed };
}

export async function runTransferTask(input: unknown): Promise<unknown> {
  const task = transferTask.parse(input);
  try {
    switch (task.kind) {
      case 'readAnki':
        return await readAnki(task);
      case 'readRemnote':
        return await readRemnote(task);
      case 'writeZip':
        return await writeZip(task);
      case 'readExport':
        return await readExport(task);
    }
  } catch (error) {
    if (error instanceof UnsafeZipError) {
      return { ok: false, problem: 'unsafe' };
    }
    if (error instanceof NotAZipError) {
      return {
        ok: false,
        problem:
          task.kind === 'readAnki'
            ? 'notAnki'
            : task.kind === 'readRemnote'
              ? 'notRemnote'
              : 'notExport',
      };
    }
    if (error instanceof AnkiDamagedError) {
      return { ok: false, problem: 'damaged' };
    }
    throw error;
  }
}
