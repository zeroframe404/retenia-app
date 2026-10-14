import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { type Clock, systemClock } from '../core/clock';
import { adoptLegacySchedules } from './adoption';
import { ensureLedgerState } from './ledger';
import { applyMigrations } from './migrations';
import * as schema from './schema';

export interface ReteniaDatabase {
  readonly orm: BetterSQLite3Database<typeof schema>;
  readonly file: string;
  settings(): { journalMode: string; synchronous: string; foreignKeys: boolean };
  // Una instantánea consistente de la base en un archivo nuevo (para las copias).
  vacuumInto(target: string): void;
  // Pasa todo lo del diario de escritura a la base y lo vacía (antes de cerrar para restaurar).
  checkpoint(): { busy: number; log: number; checkpointed: number };
  // Deja el archivo sin diario de escritura aparte, autosuficiente (la base que se restaura).
  useRollbackJournal(): void;
  integrityCheck(): string;
  close(): void;
}

const SYNCHRONOUS = ['OFF', 'NORMAL', 'FULL', 'EXTRA'];

// Abre (o crea) la base de Retenia: modo WAL con synchronous FULL (cada confirmación espera al
// disco), claves foráneas encendidas, las migraciones al día y el libro mayor listo (su
// dispositivo y, en una base de la Fase 03, la agenda heredada). Solo esta carpeta toca SQLite
// (docs/arquitectura.md, regla R8). `onStatement` recibe cada sentencia justo antes de que se
// ejecute: lo usa solo la prueba que corta el proceso en cada punto de una escritura.
export function openDatabase(
  file: string,
  {
    clock = systemClock(),
    onStatement,
  }: { clock?: Clock; onStatement?: (statement: string) => void } = {},
): ReteniaDatabase {
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new BetterSqlite3(
    file,
    onStatement ? { verbose: (message) => onStatement(String(message)) } : {},
  );
  const orm = drizzle(sqlite, { schema });
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = FULL');
    sqlite.pragma('foreign_keys = ON');
    applyMigrations(sqlite, clock.now());
    orm.transaction((tx) => {
      ensureLedgerState(tx, clock.now());
      adoptLegacySchedules(tx, clock);
    });
  } catch (error) {
    sqlite.close();
    throw error;
  }
  return {
    orm,
    file,
    settings: () => ({
      journalMode: String(sqlite.pragma('journal_mode', { simple: true })),
      synchronous: SYNCHRONOUS[Number(sqlite.pragma('synchronous', { simple: true }))] ?? '?',
      foreignKeys: sqlite.pragma('foreign_keys', { simple: true }) === 1,
    }),
    vacuumInto: (target) => {
      sqlite.prepare('VACUUM INTO ?').run(target);
    },
    checkpoint: () => {
      const [result] = sqlite.pragma('wal_checkpoint(TRUNCATE)') as {
        busy: number;
        log: number;
        checkpointed: number;
      }[];
      return result ?? { busy: 1, log: -1, checkpointed: -1 };
    },
    useRollbackJournal: () => {
      sqlite.pragma('journal_mode = DELETE');
    },
    integrityCheck: () => String(sqlite.pragma('integrity_check', { simple: true })),
    close: () => {
      sqlite.close();
    },
  };
}
