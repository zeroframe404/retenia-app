import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  extensionFor,
  HEAD_BYTES,
  identifyContent,
  type MaterialKind,
} from '../../core/materials/signature';
import type { ErrorProblem } from '../../core/materials/status';
import { newId } from '../../data/ids';
import { originalPath } from './originals';

// La recepción y la identificación de un material (H-25, CA-111): el archivo se copia a `tmp\`
// por partes mientras se calcula su huella SHA-256, se sincroniza con el disco y recién ahí se
// mira qué es (por su contenido, no por su nombre). Si sirve, pasa a `originales\<sha256>.<ext>`
// con un renombre y queda de solo lectura; si ya había un original con esa huella, no se copia
// otra vez. Lo que no sirve no se guarda. El archivo de afuera nunca se toca: se puede borrar
// enseguida.

// Un material de más de 1 GB se rechaza sin leerlo.
export const MAX_MATERIAL_BYTES = 1024 * 1024 * 1024;

export type Received =
  | { ok: true; sha256: string; size: number; kind: MaterialKind; ext: string; name: string }
  | { ok: false; problem: ErrorProblem; size: number; name: string };

const RENAME_ATTEMPTS = 10;

async function renameWithRetries(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as { code?: string }).code ?? '';
      if (attempt >= RENAME_ATTEMPTS || !['EBUSY', 'EPERM', 'EACCES'].includes(code)) {
        throw error;
      }
      await new Promise((wake) => setTimeout(wake, 50 * attempt));
    }
  }
}

async function headOf(file: string): Promise<Uint8Array> {
  const handle = await open(file, 'r');
  try {
    const buffer = new Uint8Array(HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

// Una copia de `source` en `target`, con su huella. Se sincroniza con el disco antes de cerrar.
async function copyWithHash(
  source: NodeJS.ReadableStream,
  target: string,
): Promise<{ sha256: string; size: number }> {
  const hash = createHash('sha256');
  let size = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk);
      size += chunk.length;
      done(null, chunk);
    },
  });
  const output = createWriteStream(target, { flags: 'wx' });
  await pipeline(source, counter, output);
  const handle = await open(target, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { sha256: hash.digest('hex'), size };
}

// Pasa la copia de `tmp\` a su lugar en `originales\`, o la borra si ese original ya existía.
async function store(
  staged: string,
  originalsDir: string,
  sha256: string,
  ext: string,
): Promise<void> {
  const target = originalPath(originalsDir, sha256, ext);
  if (target === null) {
    throw new Error('Huella o extensión inesperadas');
  }
  await mkdir(originalsDir, { recursive: true });
  const existing = await stat(target).catch(() => null);
  if (existing?.isFile()) {
    await rm(staged, { force: true });
    return;
  }
  await renameWithRetries(staged, target);
  await chmod(target, 0o444);
}

async function receive(
  source: () => NodeJS.ReadableStream,
  {
    tmpDir,
    originalsDir,
    name,
    size,
  }: { tmpDir: string; originalsDir: string; name: string; size: number },
): Promise<Received> {
  if (size > MAX_MATERIAL_BYTES) {
    return { ok: false, problem: 'tooLarge', size, name };
  }
  if (size === 0) {
    return { ok: false, problem: 'empty', size, name };
  }
  await mkdir(tmpDir, { recursive: true });
  const staged = join(tmpDir, `recibido-${newId()}`);
  try {
    let copied: { sha256: string; size: number };
    try {
      copied = await copyWithHash(source(), staged);
    } catch {
      return { ok: false, problem: 'copyFailed', size, name };
    }
    if (copied.size > MAX_MATERIAL_BYTES) {
      return { ok: false, problem: 'tooLarge', size: copied.size, name };
    }
    const identified = identifyContent({ head: await headOf(staged), size: copied.size, name });
    if (!identified.ok) {
      return { ok: false, problem: identified.problem, size: copied.size, name };
    }
    const ext = extensionFor(identified.kind);
    try {
      await store(staged, originalsDir, copied.sha256, ext);
    } catch {
      return { ok: false, problem: 'copyFailed', size: copied.size, name };
    }
    return { ok: true, sha256: copied.sha256, size: copied.size, kind: identified.kind, ext, name };
  } finally {
    await rm(staged, { force: true }).catch(() => undefined);
  }
}

// Un archivo del disco.
export async function receiveFile(
  path: string,
  dirs: { tmpDir: string; originalsDir: string },
): Promise<Received> {
  const name = basename(path).normalize('NFC');
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) {
    return { ok: false, problem: 'copyFailed', size: 0, name };
  }
  return receive(() => createReadStream(path), { ...dirs, name, size: info.size });
}

// Un texto pegado: se guarda como original de texto (en UTF-8), con su huella.
export async function receiveText(
  text: string,
  name: string,
  dirs: { tmpDir: string; originalsDir: string },
): Promise<Received> {
  const bytes = Buffer.from(text.normalize('NFC'), 'utf8');
  return receive(() => Readable.from([bytes]), { ...dirs, name, size: bytes.length });
}
