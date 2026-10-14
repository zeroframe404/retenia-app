import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { type Clock, systemClock } from '../core/clock';
import { applyMigrations } from './migrations';
import * as schema from './schema';

export interface ReteniaDatabase {
  readonly orm: BetterSQLite3Database<typeof schema>;
  settings(): { journalMode: string; synchronous: string; foreignKeys: boolean };
  close(): void;
}

const SYNCHRONOUS = ['OFF', 'NORMAL', 'FULL', 'EXTRA'];

// Abre (o crea) la base de Retenia: modo WAL con synchronous FULL, claves foráneas encendidas
// y las migraciones al día. Solo esta carpeta toca SQLite (docs/arquitectura.md, regla R8).
export function openDatabase(
  file: string,
  { clock = systemClock() }: { clock?: Clock } = {},
): ReteniaDatabase {
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new BetterSqlite3(file);
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = FULL');
    sqlite.pragma('foreign_keys = ON');
    applyMigrations(sqlite, clock.now());
  } catch (error) {
    sqlite.close();
    throw error;
  }
  return {
    orm: drizzle(sqlite, { schema }),
    settings: () => ({
      journalMode: String(sqlite.pragma('journal_mode', { simple: true })),
      synchronous: SYNCHRONOUS[Number(sqlite.pragma('synchronous', { simple: true }))] ?? '?',
      foreignKeys: sqlite.pragma('foreign_keys', { simple: true }) === 1,
    }),
    close: () => {
      sqlite.close();
    },
  };
}
