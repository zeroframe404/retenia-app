import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changedMigrations } from '../../tools/lib/migraciones.mjs';
import { ROOT } from '../../tools/lib/proceso.mjs';

const FOLDER = join(ROOT, 'src', 'data', 'migrations');
const files = readdirSync(FOLDER)
  .filter((name) => name.endsWith('.sql'))
  .sort();

// docs/modelo-de-datos.md: «Las migraciones solo agregan. Tablas y columnas nuevas (con valor
// por defecto o nulas), índices y disparadores. Nunca DROP, RENAME ni ALTER … DROP.»
const FORBIDDEN = [
  { pattern: /\bDROP\b/i, what: 'DROP' },
  { pattern: /\bRENAME\b/i, what: 'RENAME' },
  { pattern: /\bDELETE\s+FROM\b/i, what: 'DELETE FROM' },
  { pattern: /\bTRUNCATE\b/i, what: 'TRUNCATE' },
];

describe('migraciones de la base', () => {
  it('una migración que ya entró al historial no cambia nunca: mismo nombre y mismo contenido que en su primer commit', async () => {
    expect(await changedMigrations(ROOT)).toEqual([]);
  });

  it('hay al menos la primera y los números son consecutivos desde 0000', () => {
    expect(files.length).toBeGreaterThan(0);
    expect(files.map((name) => name.slice(0, 4))).toEqual(
      files.map((_, index) => String(index).padStart(4, '0')),
    );
  });

  it.for(files)('solo agregan: %s no tiene DROP, RENAME ni borrados', (name) => {
    const sql = readFileSync(join(FOLDER, name), 'utf8').replace(/--[^\n]*/g, '');
    const found = FORBIDDEN.filter(({ pattern }) => pattern.test(sql)).map(({ what }) => what);
    expect(found).toEqual([]);
  });

  it.for(files)('%s crea sus tablas con IF NOT EXISTS o solo agrega columnas e índices', (name) => {
    const sql = readFileSync(join(FOLDER, name), 'utf8').replace(/--[^\n]*/g, '');
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.trim())
      .filter((statement) => statement !== '');
    for (const statement of statements) {
      expect(statement, statement).toMatch(
        /^(CREATE (TABLE|INDEX|UNIQUE INDEX|TRIGGER)|ALTER TABLE `?\w+`? ADD( COLUMN)?)\b/i,
      );
    }
  });
});
