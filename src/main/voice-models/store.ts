// La carpeta de modelos de voz y su descarga única (CA-024). Cada archivo se baja a una carpeta
// de descargas, se le calcula la huella SHA-256 mientras llega y recién si el tamaño y la huella
// coinciden con el manifiesto pasa a su lugar; si no, se descarta. Si la conexión se corta, lo
// bajado queda y la próxima vez se pide solo lo que falta («Range»). Lo ya verificado se anota
// en verificados.json con el tamaño y la fecha de cada archivo: uno cambiado después deja de
// contar como listo y se vuelve a bajar.
// Este archivo solo importa módulos de Node: lo usan también las herramientas de la red
// (tools/preparar.mjs) para los modelos de desarrollo.
import { createHash, type Hash } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { ModelFile } from './manifest';

export type ModelsProblem = 'offline' | 'corrupt' | 'server' | 'disk';

export class ModelsError extends Error {
  readonly problem: ModelsProblem;
  constructor(problem: ModelsProblem) {
    super(`No se pudieron bajar los modelos (${problem})`);
    this.name = 'ModelsError';
    this.problem = problem;
  }
}

export interface ModelsStatus {
  ready: boolean;
  doneBytes: number;
  totalBytes: number;
}

export interface ModelStore {
  // La carpeta de modelos: de ahí los carga el proceso de voz.
  readonly dir: string;
  status(): ModelsStatus;
  download(options: {
    onProgress?: (progress: { doneBytes: number; totalBytes: number }) => void;
    offline?: boolean;
  }): Promise<void>;
}

type Fetch = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

interface VerifiedEntry {
  size: number;
  mtimeMs: number;
  sha256: string;
}

const VERIFIED = 'verificados.json';
const DOWNLOADS = '.descargas';
// Además de lo que falta bajar, se pide este margen libre en el disco.
const DISK_MARGIN = 50 * 1024 * 1024;

export function modelUrl(origin: string, model: ModelFile): string {
  return `${origin}/${model.source}/resolve/${model.revision}/${model.file}`;
}

function defaultFreeSpace(dir: string): number {
  const stats = statfsSync(dir);
  return stats.bavail * stats.bsize;
}

async function hashFile(path: string, hash: Hash): Promise<void> {
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
}

export function createModelStore({
  dir,
  files,
  origin,
  fetch: fetchModel = fetch,
  freeSpace = defaultFreeSpace,
}: {
  dir: string;
  files: readonly ModelFile[];
  origin?: string;
  fetch?: Fetch;
  freeSpace?: (dir: string) => number;
}): ModelStore {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const downloads = join(dir, DOWNLOADS);

  const readVerified = (): Record<string, VerifiedEntry> => {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, VERIFIED), 'utf8'));
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, VerifiedEntry>)
        : {};
    } catch {
      return {};
    }
  };

  const writeVerified = (verified: Record<string, VerifiedEntry>) => {
    const temporary = join(dir, `${VERIFIED}.nuevo`);
    writeFileSync(temporary, `${JSON.stringify(verified, null, 2)}\n`);
    renameSync(temporary, join(dir, VERIFIED));
  };

  const isVerified = (file: ModelFile, verified: Record<string, VerifiedEntry>): boolean => {
    const entry = verified[file.path];
    const path = join(dir, file.path);
    if (!entry || entry.sha256 !== file.sha256 || !existsSync(path)) {
      return false;
    }
    const stats = statSync(path);
    return stats.size === file.size && stats.mtimeMs === entry.mtimeMs;
  };

  const status = (): ModelsStatus => {
    const verified = readVerified();
    const doneBytes = files
      .filter((file) => isVerified(file, verified))
      .reduce((sum, file) => sum + file.size, 0);
    return { ready: doneBytes === totalBytes, doneBytes, totalBytes };
  };

  // La carpeta de descargas se borra cuando queda vacía: no deja nada a medias a la vista.
  const tidyDownloads = () => {
    if (existsSync(downloads) && readdirSync(downloads).length === 0) {
      rmdirSync(downloads);
    }
  };

  const partialOf = (file: ModelFile) =>
    join(downloads, `${file.path.replaceAll('/', '__')}.parcial`);

  async function fetchInto(
    file: ModelFile,
    partial: string,
    report: (have: number) => void,
  ): Promise<{ have: number; hash: Hash }> {
    let have = existsSync(partial) ? statSync(partial).size : 0;
    if (have > file.size) {
      rmSync(partial, { force: true });
      have = 0;
    }
    let hash = createHash('sha256');
    if (have > 0) {
      await hashFile(partial, hash);
    }
    report(have);
    if (have === file.size) {
      return { have, hash };
    }
    if (!origin) {
      throw new Error('Falta de dónde bajar los modelos');
    }
    let response: Response;
    try {
      response = await fetchModel(modelUrl(origin, file), {
        headers: have > 0 ? { Range: `bytes=${have}-` } : {},
      });
    } catch {
      throw new ModelsError('offline');
    }
    if (response.status === 200 && have > 0) {
      // El servidor no sabe seguir desde la mitad: se empieza de nuevo.
      have = 0;
      hash = createHash('sha256');
    } else if (response.status !== 200 && !(response.status === 206 && have > 0)) {
      throw new ModelsError('server');
    }
    if (!response.body) {
      throw new ModelsError('server');
    }
    const fd = openSync(partial, have > 0 ? 'a' : 'w');
    try {
      for await (const chunk of response.body) {
        writeSync(fd, chunk);
        hash.update(chunk);
        have += chunk.length;
        if (have > file.size) {
          break;
        }
        report(have);
      }
      fsyncSync(fd);
    } catch (error) {
      const code = (error as { code?: string }).code;
      throw new ModelsError(code === 'ENOSPC' ? 'disk' : 'offline');
    } finally {
      closeSync(fd);
    }
    return { have, hash };
  }

  async function download({
    onProgress,
    offline = false,
  }: Parameters<ModelStore['download']>[0]): Promise<void> {
    if (offline) {
      throw new ModelsError('offline');
    }
    mkdirSync(dir, { recursive: true });
    const verified = readVerified();
    const pending = files.filter((file) => !isVerified(file, verified));
    const missing = pending.reduce((sum, file) => sum + file.size, 0);
    if (freeSpace(dir) < missing + DISK_MARGIN) {
      throw new ModelsError('disk');
    }
    let done = totalBytes - missing;
    onProgress?.({ doneBytes: done, totalBytes });
    mkdirSync(downloads, { recursive: true });
    try {
      for (const file of pending) {
        const partial = partialOf(file);
        const { have, hash } = await fetchInto(file, partial, (bytes) =>
          onProgress?.({ doneBytes: done + bytes, totalBytes }),
        );
        if (have !== file.size || hash.digest('hex') !== file.sha256) {
          rmSync(partial, { force: true });
          throw new ModelsError('corrupt');
        }
        const target = join(dir, file.path);
        mkdirSync(dirname(target), { recursive: true });
        rmSync(target, { force: true });
        renameSync(partial, target);
        verified[file.path] = {
          size: file.size,
          mtimeMs: statSync(target).mtimeMs,
          sha256: file.sha256,
        };
        writeVerified(verified);
        done += file.size;
      }
    } finally {
      tidyDownloads();
    }
  }

  return { dir, status, download };
}
