import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isAutomaticBackupDue } from '../core/backups';
import type { Clock } from '../core/clock';
import { type ActivityStore, createActivityStore } from './activity';
import {
  BackupError,
  type BackupView,
  backupStamps,
  createBackup,
  listBackupFiles,
  prepareRestore,
  pruneAutomaticBackups,
  type ReadableBackup,
  type Step,
} from './backups';
import { type CardsStore, createCardsStore } from './cards';
import { openDatabase } from './database';
import { newId } from './ids';
import { continueSequence, readLedgerState } from './ledger';
import { migrationIds } from './migrations';
import { type DataDifference, repairData, verifyData } from './projections';
import { createTrashStore, type TrashStore } from './trash';

// La carpeta de datos de Retenia y lo que vive en ella: la base (retenia.db), las copias
// (copias\) y los archivos de trabajo (tmp\). Es la dueña de la conexión: restaurar una copia
// cierra la base, la reemplaza y la vuelve a abrir sin reiniciar el programa, y los almacenes
// se piden en cada uso para que nadie se quede con la base vieja.

export interface Workspace {
  readonly dataDir: string;
  readonly copiesDir: string;
  readonly cards: CardsStore;
  readonly trash: TrashStore;
  readonly activity: ActivityStore;
  verifyData(): DataDifference[];
  repairData(): DataDifference[];
  integrityCheck(): string;
  // La carpeta de copias, creada si todavía no existe (para «Abrir carpeta de copias»).
  copiesFolder(): string;
  // La lista de copias. Si la copia automática del arranque está en curso, la espera.
  backups(): Promise<BackupView[]>;
  createBackup(kind: 'manual' | 'auto'): Promise<ReadableBackup>;
  // Al abrir: una copia automática si no hay ninguna o la última tiene 24 horas o más; después
  // quedan las 14 automáticas más nuevas.
  ensureAutomaticBackup(): Promise<ReadableBackup | null>;
  // Guarda primero una copia «Antes de restaurar» (si no puede, no restaura nada) y después
  // reemplaza la base por la de la copia elegida.
  restoreBackup(backupId: string): Promise<{ restored: ReadableBackup; safety: ReadableBackup }>;
  close(): void;
}

class UnknownBackupError extends Error {
  constructor() {
    super('No encontré esa copia');
    this.name = 'UnknownBackupError';
  }
}

const RENAME_ATTEMPTS = 10;

// Windows puede tener el archivo tomado un instante (el antivirus, el indexador): se reintenta.
async function renameWithRetries(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt >= RENAME_ATTEMPTS || !['EBUSY', 'EPERM', 'EACCES'].includes(code ?? '')) {
        throw error;
      }
      await new Promise((wake) => setTimeout(wake, 50 * attempt));
    }
  }
}

// Borra si puede. Lo que Windows tiene tomado (el antivirus, el indexador) queda para la próxima.
function removeIfPossible(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // Los restos llevan nombres únicos: uno que quedó no estorba a las copias nuevas.
  }
}

// Lo que quedó a medias de una copia o una restauración cortadas. Nunca impide abrir Retenia.
function cleanLeftovers(tmpDir: string, copiesDir: string): void {
  if (existsSync(tmpDir) && statSync(tmpDir).isDirectory()) {
    for (const entry of readdirSync(tmpDir)) {
      removeIfPossible(join(tmpDir, entry));
    }
  } else {
    removeIfPossible(tmpDir);
  }
  try {
    mkdirSync(tmpDir, { recursive: true });
  } catch {
    // Sin carpeta de trabajo, la próxima copia falla y lo dice; abrir Retenia no depende de eso.
  }
  if (existsSync(copiesDir)) {
    for (const name of readdirSync(copiesDir).filter((entry) => entry.endsWith('.tmp'))) {
      removeIfPossible(join(copiesDir, name));
    }
  }
}

export function openWorkspace({
  dataDir,
  clock,
  appVersion,
  onStatement,
  onStep,
}: {
  dataDir: string;
  clock: Clock;
  appVersion: string;
  onStatement?: (statement: string) => void;
  onStep?: Step;
}): Workspace {
  const dbFile = join(dataDir, 'retenia.db');
  const copiesDir = join(dataDir, 'copias');
  const tmpDir = join(dataDir, 'tmp');
  const place = { copiesDir, tmpDir };
  const step: Step = onStep ?? (() => undefined);
  // Los avisos de después de reemplazar el archivo al restaurar: si uno falla, la restauración
  // igual quedó hecha.
  const notifyAfterReplacing = (name: string) => {
    try {
      step(name);
    } catch {
      // La base ya es la de la copia: un aviso que falla no cambia eso.
    }
  };
  cleanLeftovers(tmpDir, copiesDir);

  // La base abierta y sus almacenes.
  const connect = () => {
    const db = openDatabase(dbFile, onStatement ? { clock, onStatement } : { clock });
    return {
      db,
      cards: createCardsStore(db, clock),
      trash: createTrashStore(db, clock),
      activity: createActivityStore(db, clock),
    };
  };
  type Live = ReturnType<typeof connect>;
  let live: Live | null = connect();
  let closed = false;
  let automatic: Promise<unknown> = Promise.resolve();

  // La base para cada pedido. Si después de restaurar no se pudo volver a abrir (Windows la
  // tenía tomada, por ejemplo), se intenta de nuevo acá: el pedido siguiente la abre.
  const current = (): Live => {
    if (closed) {
      throw new Error('La carpeta de datos ya se cerró');
    }
    live ??= connect();
    return live;
  };
  const reopenIfPossible = () => {
    try {
      current();
    } catch {
      // Queda cerrada: el pedido siguiente vuelve a intentar.
    }
  };

  // Cierra la base viva para reemplazarla: todo lo del diario de escritura pasa a la base y no
  // puede quedar un -wal con contenido.
  const closeLive = () => {
    const { db } = current();
    const checkpoint = db.checkpoint();
    db.close();
    live = null;
    if (checkpoint.busy !== 0) {
      throw new BackupError('La base estaba ocupada y no se pudo cerrar del todo');
    }
    for (const suffix of ['-wal', '-shm']) {
      const journal = `${dbFile}${suffix}`;
      if (existsSync(journal)) {
        if (suffix === '-wal' && statSync(journal).size > 0) {
          throw new BackupError('Quedó un diario de escritura sin pasar a la base');
        }
        rmSync(journal, { force: true });
      }
    }
  };

  const backup = (kind: 'manual' | 'auto' | 'before_restore') =>
    createBackup(current().db, place, { kind, clock, appVersion, onStep: step });

  return {
    dataDir,
    copiesDir,
    get cards() {
      return current().cards;
    },
    get trash() {
      return current().trash;
    },
    get activity() {
      return current().activity;
    },
    verifyData: () => verifyData(current().db),
    repairData: () => repairData(current().db),
    integrityCheck: () => current().db.integrityCheck(),
    copiesFolder: () => {
      mkdirSync(copiesDir, { recursive: true });
      return copiesDir;
    },

    async backups() {
      await automatic.catch(() => undefined);
      return listBackupFiles(copiesDir).map(({ view }) => view);
    },

    createBackup: (kind) => backup(kind),

    ensureAutomaticBackup() {
      const run = async () => {
        if (!isAutomaticBackupDue(backupStamps(copiesDir), clock.now())) {
          return null;
        }
        const created = await backup('auto');
        pruneAutomaticBackups(copiesDir);
        return created;
      };
      const pending = run();
      automatic = pending;
      return pending;
    },

    async restoreBackup(backupId) {
      const chosen = listBackupFiles(copiesDir).find(
        ({ view }) => view.readable && view.id === backupId,
      );
      if (!chosen?.view.readable) {
        throw new UnknownBackupError();
      }
      const restored = chosen.view;
      // Primero, sí o sí, el estado actual en una copia verificada. Si falla, no se sigue.
      const safety = await backup('before_restore');

      const incoming = join(tmpDir, `restaurar-${newId()}.db`);
      try {
        await prepareRestore(chosen.file, incoming, migrationIds());
        step('extraída');
        const prepared = openDatabase(incoming, { clock });
        try {
          continueSequence(prepared.orm, readLedgerState(current().db.orm));
          prepared.switchToRollbackJournal();
        } finally {
          prepared.close();
        }
        step('preparada');
        closeLive();
        step('cerrada');
        await renameWithRetries(incoming, dbFile);
      } catch (error) {
        // Todavía no se reemplazó nada: la base sigue siendo la de antes.
        rmSync(incoming, { force: true });
        reopenIfPossible();
        throw error;
      }
      // Desde acá la base ya es la de la copia: la restauración está hecha, falle lo que falle
      // después. Si no se puede volver a abrir ahora, la abre el pedido siguiente.
      notifyAfterReplacing('reemplazada');
      reopenIfPossible();
      notifyAfterReplacing('reabierta');
      return { restored, safety };
    },

    close() {
      if (!closed) {
        closed = true;
        live?.db.close();
        live = null;
      }
    },
  };
}
