import BetterSqlite3 from 'better-sqlite3';
import type { AnkiCollection } from '../../core/imports/anki';
import { decodeProto, ProtobufError } from '../../core/imports/protobuf';

// La base SQLite de una colección de Anki (H-29), leída en el proceso aislado. Es un archivo ajeno:
// se abre de solo lectura, sin confiar en su esquema (no corre funciones ni disparadores de la
// base), se revisa entera antes de leer y se consultan solo las columnas conocidas de las tablas
// conocidas, con un tope de filas. Lo que no cumple es una colección dañada.

export class AnkiDamagedError extends Error {
  constructor(reason: string) {
    super(`Colección de Anki dañada: ${reason}`);
    this.name = 'AnkiDamagedError';
  }
}

const MAX_ROWS = 2_000_000;
const REQUIRED = ['col', 'notes', 'cards', 'revlog'];

type Row = Record<string, unknown>;

const asNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value));
const asText = (value: unknown) =>
  typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);

export function readAnkiCollection(file: string): AnkiCollection {
  let db: BetterSqlite3.Database;
  try {
    db = new BetterSqlite3(file, { readonly: true, fileMustExist: true });
  } catch {
    throw new AnkiDamagedError('no es una base SQLite');
  }
  try {
    db.pragma('trusted_schema = OFF');
    db.pragma('query_only = ON');
    db.pragma('cell_size_check = ON');
    let check: string;
    try {
      check = String(db.pragma('quick_check', { simple: true }));
    } catch {
      throw new AnkiDamagedError('no es una base SQLite');
    }
    if (check !== 'ok') {
      throw new AnkiDamagedError('la revisión de la base falló');
    }
    const objects = db
      .prepare("SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")
      .all() as {
      name: string;
      type: string;
    }[];
    const tableNamed = (name: string) =>
      objects.some((item) => item.name === name && item.type === 'table');
    for (const name of REQUIRED) {
      if (!tableNamed(name)) {
        throw new AnkiDamagedError(`falta la tabla ${name}`);
      }
    }
    const all = (sql: string): Row[] => {
      const rows: Row[] = [];
      for (const row of db.prepare(sql).iterate() as Iterable<Row>) {
        rows.push(row);
        if (rows.length > MAX_ROWS) {
          throw new AnkiDamagedError('demasiadas filas');
        }
      }
      return rows;
    };
    const modern =
      tableNamed('notetypes') &&
      tableNamed('templates') &&
      tableNamed('fields') &&
      tableNamed('decks');
    const notetypes: AnkiCollection['notetypes'] = [];
    const decks: AnkiCollection['decks'] = [];
    if (modern && all('SELECT 1 FROM notetypes LIMIT 1').length > 0) {
      const fields = all('SELECT ntid, ord, name FROM fields ORDER BY ntid, ord');
      const templates = all('SELECT ntid, ord, config FROM templates ORDER BY ntid, ord');
      for (const row of all('SELECT id, name, config FROM notetypes')) {
        const id = asNumber(row.id);
        let kind: 'normal' | 'cloze' = 'normal';
        try {
          kind = decodeProto(row.config as Uint8Array).varint(1) === 1n ? 'cloze' : 'normal';
        } catch (error) {
          if (error instanceof ProtobufError) {
            throw new AnkiDamagedError('un tipo de nota ilegible');
          }
          throw error;
        }
        notetypes.push({
          id,
          name: asText(row.name),
          kind,
          fields: fields
            .filter((field) => asNumber(field.ntid) === id)
            .map((field) => asText(field.name)),
          templates: templates
            .filter((template) => asNumber(template.ntid) === id)
            .map((template) => {
              try {
                const config = decodeProto(template.config as Uint8Array);
                return {
                  ord: asNumber(template.ord),
                  qfmt: config.string(1),
                  afmt: config.string(2),
                };
              } catch {
                throw new AnkiDamagedError('una plantilla ilegible');
              }
            }),
        });
      }
      for (const row of all('SELECT id, name FROM decks')) {
        decks.push({ id: asNumber(row.id), name: asText(row.name) });
      }
    } else {
      const [col] = all('SELECT models, decks FROM col LIMIT 1');
      try {
        const models = JSON.parse(asText(col?.models) || '{}') as Record<
          string,
          {
            id: number;
            name: string;
            type: number;
            flds: { name: string; ord: number }[];
            tmpls: { ord: number; qfmt: string; afmt: string }[];
          }
        >;
        for (const model of Object.values(models)) {
          notetypes.push({
            id: asNumber(model.id),
            name: asText(model.name),
            kind: model.type === 1 ? 'cloze' : 'normal',
            fields: [...(model.flds ?? [])]
              .sort((a, b) => a.ord - b.ord)
              .map((field) => asText(field.name)),
            templates: (model.tmpls ?? []).map((template) => ({
              ord: asNumber(template.ord),
              qfmt: asText(template.qfmt),
              afmt: asText(template.afmt),
            })),
          });
        }
        const deckList = JSON.parse(asText(col?.decks) || '{}') as Record<
          string,
          { id: number; name: string }
        >;
        for (const deck of Object.values(deckList)) {
          decks.push({ id: asNumber(deck.id), name: asText(deck.name) });
        }
      } catch (error) {
        if (error instanceof AnkiDamagedError) {
          throw error;
        }
        throw new AnkiDamagedError('los tipos de nota no se pueden leer');
      }
    }
    const notes = all('SELECT id, guid, mid, tags, flds FROM notes').map((row) => ({
      id: asNumber(row.id),
      guid: asText(row.guid),
      mid: asNumber(row.mid),
      tags: asText(row.tags)
        .split(/\s+/)
        .filter((tag) => tag !== ''),
      fields: asText(row.flds).split(String.fromCharCode(31)),
    }));
    const cards = all('SELECT id, nid, did, odid, ord, queue FROM cards').map((row) => ({
      id: asNumber(row.id),
      nid: asNumber(row.nid),
      did: asNumber(row.did),
      odid: asNumber(row.odid),
      ord: asNumber(row.ord),
      queue: asNumber(row.queue),
    }));
    const revlog = all('SELECT id, cid, ease, type FROM revlog').map((row) => ({
      id: asNumber(row.id),
      cid: asNumber(row.cid),
      ease: asNumber(row.ease),
      type: asNumber(row.type),
    }));
    return { notetypes, decks, notes, cards, revlog };
  } catch (error) {
    if (error instanceof AnkiDamagedError) {
      throw error;
    }
    throw new AnkiDamagedError('no se pudo leer');
  } finally {
    db.close();
  }
}
