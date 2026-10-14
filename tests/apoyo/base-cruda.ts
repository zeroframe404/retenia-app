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
