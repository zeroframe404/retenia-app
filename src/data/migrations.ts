import type BetterSqlite3 from 'better-sqlite3';

// Las migraciones viajan dentro del programa como texto (las genera drizzle-kit desde
// schema.ts): así no dependen de dónde esté instalado ni de rutas. Solo agregan; la prueba
// «migraciones» vigila que no haya DROP ni RENAME.
const files = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface Migration {
  id: string;
  sql: string;
}

const migrations: Migration[] = Object.entries(files)
  .map(([path, sql]) => ({ id: path.replace(/^.*\//, '').replace(/\.sql$/, ''), sql }))
  .sort((a, b) => (a.id < b.id ? -1 : 1));

// Aplica las que faltan, cada una en su propia transacción, y anota cuándo.
export function applyMigrations(sqlite: BetterSqlite3.Database, appliedAt: Date): string[] {
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)',
  );
  const done = new Set(
    sqlite
      .prepare('SELECT id FROM schema_migrations')
      .all()
      .map((row) => (row as { id: string }).id),
  );
  const record = sqlite.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');
  const applied: string[] = [];
  for (const migration of migrations) {
    if (done.has(migration.id)) {
      continue;
    }
    sqlite.transaction(() => {
      sqlite.exec(migration.sql);
      record.run(migration.id, appliedAt.toISOString());
    })();
    applied.push(migration.id);
  }
  return applied;
}
