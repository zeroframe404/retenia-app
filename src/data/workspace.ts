import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isAutomaticBackupDue } from '../core/backups';
import type { Clock } from '../core/clock';
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
import { openDatabase, type ReteniaDatabase } from './database';
import { newId } from './ids';
import { continueSequence, readLedgerState } from './ledger';
import { migrationIds } from './migrations';
import { type DataDifference, repairData, verifyData } from './projections';

// La carpeta de datos de Retenia y lo que vive en ella: la base (retenia.db), las copias
// (copias\) y los archivos de trabajo (tmp\). Es la dueña de la conexión: restaurar una copia
// cierra la base, la reemplaza y la vuelve a abrir sin reiniciar el programa, y los almacenes
// se piden en cada uso para que nadie se quede con la base vieja.

export interface Workspace {
  readonly dataDir: string;
  readonly copiesDir: string;
  readonly cards: CardsStore;
  verifyData(): DataDifference[];
  repairData(): DataDifference[];
  integrityCheck(): string;
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

// Lo que quedó a medias de una copia o una restauración cortadas.
function cleanLeftovers(tmpDir: string, copiesDir: string): void {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  if (existsSync(copiesDir)) {
    for (const name of readdirSync(copiesDir).filter((entry) => entry.endsWith('.tmp'))) {
      rmSync(join(copiesDir, name), { force: true });
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
  cleanLeftovers(tmpDir, copiesDir);

  const open = () => openDatabase(dbFile, onStatement ? { clock, onStatement } : { clock });
  let db: ReteniaDatabase = open();
  let cards = createCardsStore(db, clock);
  let closed = false;
  let automatic: Promise<unknown> = Promise.resolve();

  const reopen = () => {
    db = open();
    cards = createCardsStore(db, clock);
  };

  const backup = (kind: 'manual' | 'auto' | 'before_restore') =>
    createBackup(db, place, { kind, clock, appVersion, onStep: step });

  return {
    dataDir,
    copiesDir,
    get cards() {
      return cards;
    },
    verifyData: () => verifyData(db),
    repairData: () => repairData(db),
    integrityCheck: () => db.integrityCheck(),

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
      let liveClosed = false;
      try {
        await prepareRestore(chosen.file, incoming, migrationIds());
        step('extraída');
        const live = readLedgerState(db.orm);
        const prepared = openDatabase(incoming, { clock });
        try {
          continueSequence(prepared.orm, live);
          prepared.switchToRollbackJournal();
        } finally {
          prepared.close();
        }
        step('preparada');

        const checkpoint = db.checkpoint();
        db.close();
        liveClosed = true;
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
        step('cerrada');
        await renameWithRetries(incoming, dbFile);
        step('reemplazada');
      } catch (error) {
        rmSync(incoming, { force: true });
        if (liveClosed) {
          reopen();
        }
        throw error;
      }
      reopen();
      step('reabierta');
      return { restored, safety };
    },

    close() {
      if (!closed) {
        closed = true;
        db.close();
      }
    },
  };
}
