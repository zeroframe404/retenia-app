import Database from 'better-sqlite3';

// La base tal como quedó en el disco, leída sin pasar por Retenia: para comprobar filas exactas
// y para intentar lo que Retenia nunca hace (modificar o borrar el historial).

export type Row = Record<string, unknown>;

export function readRows(file: string, sql: string, ...params: unknown[]): Row[] {
  const raw = new Database(file, { readonly: true });
  try {
    return raw.prepare(sql).all(...params) as Row[];
  } finally {
    raw.close();
  }
}

export function runRaw(file: string, sql: string, ...params: unknown[]): void {
  const raw = new Database(file);
  try {
    raw.prepare(sql).run(...params);
  } finally {
    raw.close();
  }
}

// Las tablas de eventos: lo que nunca se modifica ni se borra.
const EVENT_TABLES = ['observations', 'evaluations', 'operations'] as const;

// Todas las filas de las tablas de Retenia, ordenadas, para comparar dos bases enteras.
export function dumpTables(file: string, { except = [] }: { except?: string[] } = {}) {
  const raw = new Database(file, { readonly: true });
  try {
    const tables = (
      raw
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as { name: string }[]
    )
      .map((row) => row.name)
      .filter((name) => !except.includes(name));
    return Object.fromEntries(
      tables.map((table) => [table, raw.prepare(`SELECT * FROM "${table}" ORDER BY 1`).all()]),
    ) as Record<string, Row[]>;
  } finally {
    raw.close();
  }
}

// Las filas de eventos por identificador, para ver que ninguna cambió.
export function eventsById(file: string): Map<string, string> {
  const events = new Map<string, string>();
  for (const table of EVENT_TABLES) {
    for (const row of readRows(file, `SELECT * FROM ${table}`)) {
      events.set(`${table}:${String(row.id)}`, JSON.stringify(row));
    }
  }
  return events;
}
