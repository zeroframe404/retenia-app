import { createHash } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { constants, createGunzip, createGzip, gunzipSync } from 'node:zlib';
import BetterSqlite3 from 'better-sqlite3';
import { z } from 'zod';
import {
  automaticBackupsToPrune,
  BACKUP_EXTENSION,
  type BackupStamp,
  backupFileName,
  newestFirst,
} from '../core/backups';
import { BUENOS_AIRES_ZONE, type Clock } from '../core/clock';
import { localDateTime } from '../core/study-day';
import type { ReteniaDatabase } from './database';
import { newId } from './ids';

// Las copias de seguridad (H-05). Una copia es un archivo comprimido (gzip) con un renglón de
// manifiesto y, después, una instantánea consistente de la base (VACUUM INTO). La carpeta de
// copias es la que manda: restaurar reemplaza la base, y una base dañada igual tiene que saber
// qué copias hay. Toda copia se abre y se cuenta antes de aparecer en la lista.

export type BackupKind = BackupStamp['kind'];

const TABLE_NAME = /^[a-z_]+$/;
const COUNTED_TABLES = [
  'cards',
  'card_versions',
  'card_schedule',
  'observations',
  'evaluations',
  'operations',
  'trash_entries',
  'subjects',
  'topics',
  'topic_aliases',
  'notes',
  'blocks',
  'block_versions',
  'block_links',
  'images',
  'inbox_items',
];

const manifestSchema = z.strictObject({
  format: z.literal('retenia-copia'),
  formatVersion: z.literal(1),
  id: z.uuid(),
  kind: z.enum(['auto', 'manual', 'before_restore']),
  createdAt: z.iso.datetime(),
  timeZone: z.string(),
  appVersion: z.string(),
  migrations: z.array(z.string().regex(/^\d{4}_[a-z_]+$/)),
  counts: z.record(z.string().regex(TABLE_NAME), z.number().int().nonnegative()),
  databaseBytes: z.number().int().positive(),
  databaseSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
type Manifest = z.output<typeof manifestSchema>;

export interface ReadableBackup {
  readonly id: string;
  readonly kind: BackupKind;
  readonly createdAt: string;
  readonly day: string;
  readonly time: string;
  readonly sizeBytes: number;
  readonly readable: true;
}

// Un archivo de la carpeta que no se pudo abrir: se muestra, pero no se ofrece para restaurar.
interface UnreadableBackup {
  readonly id: null;
  readonly kind: null;
  readonly createdAt: null;
  readonly day: null;
  readonly time: null;
  readonly sizeBytes: number;
  readonly readable: false;
}

export type BackupView = ReadableBackup | UnreadableBackup;

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

// Los pasos con archivos de una copia, para la prueba que corta el proceso entre cada uno.
export type Step = (name: string) => void;

function readableView(manifest: Manifest, sizeBytes: number): ReadableBackup {
  const { day, time } = localDateTime(new Date(manifest.createdAt));
  return {
    id: manifest.id,
    kind: manifest.kind,
    createdAt: manifest.createdAt,
    day,
    time,
    sizeBytes,
    readable: true,
  };
}

function syncFile(path: string): void {
  const descriptor = openSync(path, 'r+');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

async function hashFile(path: string): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
    bytes += (chunk as Buffer).length;
  }
  return { sha256: hash.digest('hex'), bytes };
}

// Qué hay adentro de una base: cuántas filas por tabla y qué migraciones tiene.
function describeDatabase(path: string): { counts: Record<string, number>; migrations: string[] } {
  const db = new BetterSqlite3(path, { readonly: true, fileMustExist: true });
  try {
    const counts = Object.fromEntries(
      COUNTED_TABLES.map((table) => [
        table,
        (db.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n,
      ]),
    );
    const migrations = (
      db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as { id: string }[]
    ).map((row) => row.id);
    return { counts, migrations };
  } finally {
    db.close();
  }
}

// La base de una copia está sana y tiene lo que dice su manifiesto.
function checkDatabase(path: string, manifest: Manifest): void {
  const db = new BetterSqlite3(path, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new BackupError('La base de la copia no está sana');
    }
    for (const [table, expected] of Object.entries(manifest.counts)) {
      const { n } = db.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number };
      if (n !== expected) {
        throw new BackupError('La copia no tiene lo que dice su manifiesto');
      }
    }
  } finally {
    db.close();
  }
}

const MANIFEST_PEEK_BYTES = 64 * 1024;
const GZIP_SIZE_BYTES = 4;

// El manifiesto sin descomprimir la copia entera: el principio del archivo alcanza. Además, los
// últimos 4 bytes de un gzip dicen cuánto medía lo comprimido: en una copia que se cortó después
// de hecha no coinciden con lo que dice el manifiesto, y esa copia ya no se da por buena.
function readManifest(file: string): Manifest {
  const descriptor = openSync(file, 'r');
  let head: Buffer;
  const size = Buffer.alloc(GZIP_SIZE_BYTES);
  try {
    head = Buffer.alloc(MANIFEST_PEEK_BYTES);
    head = head.subarray(0, readSync(descriptor, head, 0, MANIFEST_PEEK_BYTES, 0));
    const fileBytes = fstatSync(descriptor).size;
    if (
      fileBytes < GZIP_SIZE_BYTES ||
      readSync(descriptor, size, 0, GZIP_SIZE_BYTES, fileBytes - GZIP_SIZE_BYTES) !==
        GZIP_SIZE_BYTES
    ) {
      throw new BackupError('La copia está incompleta');
    }
  } finally {
    closeSync(descriptor);
  }
  const start = gunzipSync(head, { finishFlush: constants.Z_SYNC_FLUSH });
  const newline = start.indexOf(0x0a);
  if (newline < 0) {
    throw new BackupError('La copia no tiene manifiesto');
  }
  const manifest = manifestSchema.parse(JSON.parse(start.subarray(0, newline).toString('utf8')));
  // Lo comprimido es el renglón del manifiesto, su salto de línea y la base (módulo 2^32).
  if (size.readUInt32LE(0) !== (newline + 1 + manifest.databaseBytes) % 2 ** 32) {
    throw new BackupError('La copia está incompleta');
  }
  return manifest;
}

// Descomprime la base de una copia en `target` y comprueba que es la misma que se guardó (huella
// y tamaño), que está sana y que tiene lo que dice el manifiesto.
async function extractVerified(file: string, target: string): Promise<Manifest> {
  const hash = createHash('sha256');
  let bytes = 0;
  let header = Buffer.alloc(0);
  let manifest: Manifest | null = null;
  await pipeline(
    createReadStream(file),
    createGunzip(),
    async function* (source: AsyncIterable<Buffer>) {
      for await (const chunk of source) {
        let data = chunk;
        if (manifest === null) {
          header = Buffer.concat([header, chunk]);
          const newline = header.indexOf(0x0a);
          if (newline < 0) {
            if (header.length > MANIFEST_PEEK_BYTES) {
              throw new BackupError('La copia no tiene manifiesto');
            }
            continue;
          }
          manifest = manifestSchema.parse(JSON.parse(header.subarray(0, newline).toString('utf8')));
          data = header.subarray(newline + 1);
        }
        hash.update(data);
        bytes += data.length;
        yield data;
      }
    },
    createWriteStream(target, { flags: 'wx' }),
  );
  const found = manifest as Manifest | null;
  if (found === null) {
    throw new BackupError('La copia no tiene manifiesto');
  }
  if (bytes !== found.databaseBytes || hash.digest('hex') !== found.databaseSha256) {
    throw new BackupError('La copia no coincide con su huella');
  }
  syncFile(target);
  checkDatabase(target, found);
  return found;
}

export interface BackupPlace {
  readonly copiesDir: string;
  readonly tmpDir: string;
}

// Hace una copia: instantánea, comprimida con su manifiesto, sincronizada con el disco,
// verificada (se abre y se cuenta) y recién entonces publicada con su nombre definitivo. Un corte
// en el medio deja a lo sumo archivos de trabajo, que se limpian al abrir.
export async function createBackup(
  db: ReteniaDatabase,
  place: BackupPlace,
  options: { kind: BackupKind; clock: Clock; appVersion: string; onStep?: Step | undefined },
): Promise<ReadableBackup> {
  const step = options.onStep ?? (() => undefined);
  const id = newId();
  const createdAt = options.clock.now();
  mkdirSync(place.copiesDir, { recursive: true });
  mkdirSync(place.tmpDir, { recursive: true });
  const name = backupFileName({ id, kind: options.kind, createdAt });
  const snapshot = join(place.tmpDir, `copia-${id}.db`);
  const check = join(place.tmpDir, `verificacion-${id}.db`);
  const partial = join(place.copiesDir, `${name}.tmp`);
  const final = join(place.copiesDir, name);
  try {
    db.vacuumInto(snapshot);
    step('instantánea');
    const { counts, migrations } = describeDatabase(snapshot);
    const { sha256, bytes } = await hashFile(snapshot);
    const manifest: Manifest = {
      format: 'retenia-copia',
      formatVersion: 1,
      id,
      kind: options.kind,
      createdAt: createdAt.toISOString(),
      timeZone: BUENOS_AIRES_ZONE,
      appVersion: options.appVersion,
      migrations,
      counts,
      databaseBytes: bytes,
      databaseSha256: sha256,
    };
    async function* content() {
      yield Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8');
      yield* createReadStream(snapshot);
    }
    await pipeline(Readable.from(content()), createGzip(), createWriteStream(partial));
    step('comprimida');
    syncFile(partial);
    step('sincronizada');
    await extractVerified(partial, check);
    step('verificada');
    renameSync(partial, final);
    step('publicada');
    return readableView(manifest, statSync(final).size);
  } finally {
    for (const leftover of [snapshot, check, partial]) {
      rmSync(leftover, { force: true });
    }
  }
}

interface ListedBackup {
  readonly view: BackupView;
  readonly file: string;
}

// Las copias de la carpeta, de la más nueva a la más vieja; las que no se pueden abrir, al final.
export function listBackupFiles(copiesDir: string): ListedBackup[] {
  if (!existsSync(copiesDir)) {
    return [];
  }
  const readable: (ListedBackup & { view: ReadableBackup; stamp: BackupStamp })[] = [];
  const unreadable: ListedBackup[] = [];
  for (const name of readdirSync(copiesDir).filter((entry) => entry.endsWith(BACKUP_EXTENSION))) {
    const file = join(copiesDir, name);
    const sizeBytes = statSync(file).size;
    try {
      const manifest = readManifest(file);
      readable.push({
        file,
        view: readableView(manifest, sizeBytes),
        stamp: { id: manifest.id, kind: manifest.kind, createdAt: new Date(manifest.createdAt) },
      });
    } catch {
      unreadable.push({
        file,
        view: {
          id: null,
          kind: null,
          createdAt: null,
          day: null,
          time: null,
          sizeBytes,
          readable: false,
        },
      });
    }
  }
  const byId = new Map(readable.map((entry) => [entry.stamp.id, entry]));
  const ordered = newestFirst(readable.map((entry) => entry.stamp)).map(
    (stamp) => byId.get(stamp.id) as ListedBackup,
  );
  return [...ordered, ...unreadable];
}

export function backupStamps(copiesDir: string): BackupStamp[] {
  return listBackupFiles(copiesDir).flatMap(({ view }) =>
    view.readable ? [{ id: view.id, kind: view.kind, createdAt: new Date(view.createdAt) }] : [],
  );
}

// Se conservan las 14 automáticas más nuevas; las otras copias no se borran solas.
export function pruneAutomaticBackups(copiesDir: string, now: Date): number {
  const listed = listBackupFiles(copiesDir);
  const pruned = automaticBackupsToPrune(backupStamps(copiesDir), now);
  for (const stamp of pruned) {
    const entry = listed.find(({ view }) => view.id === stamp.id);
    if (entry) {
      rmSync(entry.file, { force: true });
    }
  }
  return pruned.length;
}

// La base de una copia, descomprimida y verificada en `target`, lista para reemplazar a la viva.
export async function prepareRestore(
  file: string,
  target: string,
  knownMigrations: readonly string[],
): Promise<void> {
  const manifest = await extractVerified(file, target);
  if (manifest.migrations.some((migration) => !knownMigrations.includes(migration))) {
    throw new BackupError('La copia es de una versión más nueva de Retenia');
  }
}
