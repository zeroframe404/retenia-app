// Los archivos de ejemplo de la Fase 15 (H-29): un mazo de Anki (.apkg) y una exportación de
// RemNote (.zip). Los usa el generador (tools/generar-datos-de-ejemplo.mjs) para dejar
// «mazo-demo.apkg» y «remnote-demo.zip» en datos-de-ejemplo, y las pruebas para armar en el
// momento las variantes (los formatos viejos de Anki, los archivos trampa). Los textos son propios.
//
// El formato de Anki sale de su código (rslib/src/import_export/package y proto/anki): un zip con
// la colección (SQLite), la lista de medios y los medios numerados «0», «1»… El formato actual
// (Latest) comprime la colección y los medios con zstd, guarda la lista de medios en protobuf y
// agrega «meta» (PackageMetadata) y un «collection.anki2» de relleno para los Anki viejos.
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync, zstdCompressSync } from 'node:zlib';
import Database from 'better-sqlite3';
import { zip } from './zip.mjs';

// --- protobuf mínimo (solo lo que hace falta para escribir) ---

/** @param {number | bigint} value */
function varint(value) {
  let rest = BigInt(value);
  /** @type {number[]} */
  const bytes = [];
  do {
    let byte = Number(rest & 0x7fn);
    rest >>= 7n;
    if (rest > 0n) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (rest > 0n);
  return Buffer.from(bytes);
}

/** Un campo varint. @param {number} field @param {number | bigint} value */
export function pbVarint(field, value) {
  return Buffer.concat([varint((field << 3) | 0), varint(value)]);
}

/** Un campo con largo (texto, bytes o un mensaje adentro). @param {number} field @param {Buffer | string} data */
export function pbBytes(field, data) {
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return Buffer.concat([varint((field << 3) | 2), varint(bytes.length), bytes]);
}

// --- una imagen PNG chica, armada a mano ---

/** @param {string} type @param {Buffer} data */
function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Franjas horizontales de colores. @param {number} width @param {number} height @param {number[][]} stripes */
export function stripesPng(width, height, stripes) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const color = stripes[Math.min(stripes.length - 1, Math.floor((y * stripes.length) / height))];
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = color?.[0] ?? 0;
      row[2 + x * 3] = color?.[1] ?? 0;
      row[3 + x * 3] = color?.[2] ?? 0;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export const FLAG_PNG = () =>
  stripesPng(60, 36, [
    [116, 172, 223],
    [255, 255, 255],
    [116, 172, 223],
  ]);
export const SHIELD_PNG = () =>
  stripesPng(40, 48, [
    [116, 172, 223],
    [255, 255, 255],
  ]);

// --- la colección de Anki ---

/**
 * @typedef {{ id: number, type: number, ease: number }} AnkiReview  id: el instante en milisegundos
 * @typedef {{ ord: number, id: number, deckId?: number, queue?: number, reviews: AnkiReview[] }} AnkiCard
 * @typedef {{ id: number, guid: string, notetype: 'basic' | 'reversed' | 'cloze' | 'occlusion' | string,
 *   fields: string[], tags: string[], cards: AnkiCard[] }} AnkiNote
 * @typedef {{ name: string, data: Buffer }} AnkiMedia
 * @typedef {{ format: 'latest' | 'legacy2' | 'legacy1', decks: { id: number, name: string }[],
 *   notes: AnkiNote[], media: AnkiMedia[], meta?: number, withMedia?: boolean,
 *   extraSql?: string[] }} AnkiDeckSpec
 */

const NOTETYPES = {
  basic: {
    id: 1_700_000_000_001,
    name: 'Básico',
    kind: 0,
    fields: ['Anverso', 'Reverso'],
    templates: [
      { name: 'Tarjeta 1', qfmt: '{{Anverso}}', afmt: '{{FrontSide}}<hr id=answer>{{Reverso}}' },
    ],
  },
  reversed: {
    id: 1_700_000_000_002,
    name: 'Básico (con tarjeta inversa)',
    kind: 0,
    fields: ['Anverso', 'Reverso'],
    templates: [
      { name: 'Tarjeta 1', qfmt: '{{Anverso}}', afmt: '{{FrontSide}}<hr id=answer>{{Reverso}}' },
      { name: 'Tarjeta 2', qfmt: '{{Reverso}}', afmt: '{{FrontSide}}<hr id=answer>{{Anverso}}' },
    ],
  },
  cloze: {
    id: 1_700_000_000_003,
    name: 'Cloze',
    kind: 1,
    fields: ['Texto', 'Extra'],
    templates: [{ name: 'Cloze', qfmt: '{{cloze:Texto}}', afmt: '{{cloze:Texto}}<br>{{Extra}}' }],
  },
  occlusion: {
    id: 1_700_000_000_004,
    name: 'Oclusión de imagen',
    kind: 1,
    fields: ['Occlusion', 'Image', 'Header'],
    templates: [
      {
        name: 'Oclusión',
        qfmt: '{{#Header}}{{Header}}{{/Header}}{{image-occlusion:Occlusion}}',
        afmt: '{{image-occlusion:Occlusion}}',
      },
    ],
  },
};

const SCHEMA11 = `
CREATE TABLE col (id integer primary key, crt integer not null, mod integer not null, scm integer not null,
  ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null,
  models text not null, decks text not null, dconf text not null, tags text not null);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null,
  usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null,
  flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null,
  mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null,
  ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null,
  odue integer not null, odid integer not null, flags integer not null, data text not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null,
  ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);`;

const SCHEMA18_EXTRA = `
CREATE TABLE notetypes (id integer not null primary key, name text not null, mtime_secs integer not null,
  usn integer not null, config blob not null);
CREATE TABLE fields (ntid integer not null, ord integer not null, name text not null, config blob not null,
  primary key (ntid, ord)) without rowid;
CREATE TABLE templates (ntid integer not null, ord integer not null, name text not null, mtime_secs integer not null,
  usn integer not null, config blob not null, primary key (ntid, ord)) without rowid;
CREATE TABLE decks (id integer primary key not null, name text not null, mtime_secs integer not null,
  usn integer not null, common blob not null, kind blob not null);`;

/** @param {string} type */
function notetypeOf(type) {
  const found = /** @type {Record<string, (typeof NOTETYPES)['basic']>} */ (NOTETYPES)[type];
  if (!found) {
    throw new Error(`tipo de nota desconocido: ${type}`);
  }
  return found;
}

/** @param {string[]} fields */
const checksum = (fields) =>
  Number.parseInt(
    createHash('sha1')
      .update(fields[0] ?? '')
      .digest('hex')
      .slice(0, 8),
    16,
  );

/**
 * La base SQLite de la colección, en un archivo temporal, devuelta como bytes.
 * @param {AnkiDeckSpec} spec @param {boolean} modern
 */
function collectionBytes(spec, modern) {
  const folder = mkdtempSync(join(tmpdir(), 'retenia-anki-'));
  const file = join(folder, 'collection.db');
  try {
    const db = new Database(file);
    db.exec(SCHEMA11);
    const used = [...new Set(spec.notes.map((note) => note.notetype))].map(notetypeOf);
    const models = Object.fromEntries(
      used.map((type) => [
        String(type.id),
        {
          id: type.id,
          name: type.name,
          type: type.kind,
          flds: type.fields.map((name, ord) => ({ name, ord })),
          tmpls: type.templates.map((template, ord) => ({ ...template, ord })),
          css: '',
        },
      ]),
    );
    const decks = Object.fromEntries(spec.decks.map((deck) => [String(deck.id), deck]));
    db.prepare('INSERT INTO col VALUES (1, 1767225600, 0, 0, ?, 0, 0, 0, ?, ?, ?, ?, ?)').run(
      modern ? 18 : 11,
      '{}',
      modern ? '{}' : JSON.stringify(models),
      modern ? '{}' : JSON.stringify(decks),
      '{}',
      '{}',
    );
    if (modern) {
      db.exec(SCHEMA18_EXTRA);
      for (const type of used) {
        db.prepare('INSERT INTO notetypes VALUES (?, ?, 0, 0, ?)').run(
          type.id,
          type.name,
          pbVarint(1, type.kind),
        );
        type.fields.forEach((name, ord) => {
          db.prepare('INSERT INTO fields VALUES (?, ?, ?, ?)').run(
            type.id,
            ord,
            name,
            Buffer.alloc(0),
          );
        });
        type.templates.forEach((template, ord) => {
          db.prepare('INSERT INTO templates VALUES (?, ?, ?, 0, 0, ?)').run(
            type.id,
            ord,
            template.name,
            Buffer.concat([pbBytes(1, template.qfmt), pbBytes(2, template.afmt)]),
          );
        });
      }
      for (const deck of spec.decks) {
        db.prepare('INSERT INTO decks VALUES (?, ?, 0, 0, ?, ?)').run(
          deck.id,
          deck.name.split('::').join('\u001f'),
          Buffer.alloc(0),
          pbBytes(1, Buffer.alloc(0)),
        );
      }
    }
    for (const note of spec.notes) {
      const type = notetypeOf(note.notetype);
      db.prepare('INSERT INTO notes VALUES (?, ?, ?, 0, 0, ?, ?, 0, ?, 0, ?)').run(
        note.id,
        note.guid,
        type.id,
        note.tags.length > 0 ? ` ${note.tags.join(' ')} ` : '',
        note.fields.join('\u001f'),
        checksum(note.fields),
        '',
      );
      for (const card of note.cards) {
        const reviewed = card.reviews.length > 0;
        db.prepare(
          'INSERT INTO cards VALUES (?, ?, ?, ?, 0, 0, ?, ?, 0, 0, 0, ?, 0, 0, 0, 0, 0, ?)',
        ).run(
          card.id,
          note.id,
          card.deckId ?? spec.decks[0]?.id ?? 1,
          card.ord,
          reviewed ? 2 : 0,
          card.queue ?? (reviewed ? 2 : 0),
          card.reviews.length,
          '',
        );
        for (const review of card.reviews) {
          db.prepare('INSERT INTO revlog VALUES (?, ?, 0, ?, 1, 0, 2500, 8000, ?)').run(
            review.id,
            card.id,
            review.ease,
            review.type,
          );
        }
      }
    }
    for (const statement of spec.extraSql ?? []) {
      db.exec(statement);
    }
    db.close();
    return readFileSync(file);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

// El «collection.anki2» de relleno del formato actual: una nota que pide actualizar Anki.
function placeholderCollection() {
  return collectionBytes(
    {
      format: 'legacy1',
      decks: [{ id: 1, name: 'Default' }],
      notes: [
        {
          id: 1,
          guid: 'relleno',
          notetype: 'basic',
          fields: [
            'Please update to the latest Anki version, then import the .colpkg/.apkg file again.',
            '',
          ],
          tags: [],
          cards: [{ ord: 0, id: 1, reviews: [] }],
        },
      ],
      media: [],
    },
    false,
  );
}

/** Un .apkg en el formato pedido. @param {AnkiDeckSpec} spec @returns {Buffer} */
export function ankiPackage(spec) {
  const withMedia = spec.withMedia ?? true;
  const media = withMedia ? spec.media : [];
  /** @type {{ name: string, data: Buffer }[]} */
  const entries = [];
  if (spec.format === 'latest') {
    entries.push({ name: 'collection.anki2', data: placeholderCollection() });
    entries.push({
      name: 'collection.anki21b',
      data: zstdCompressSync(collectionBytes(spec, true)),
    });
    const list = Buffer.concat(
      media.map((item) =>
        pbBytes(
          1,
          Buffer.concat([
            pbBytes(1, item.name),
            pbVarint(2, item.data.length),
            pbBytes(3, createHash('sha1').update(item.data).digest()),
          ]),
        ),
      ),
    );
    entries.push({ name: 'media', data: zstdCompressSync(list) });
    media.forEach((item, index) => {
      entries.push({ name: String(index), data: zstdCompressSync(item.data) });
    });
    entries.push({ name: 'meta', data: pbVarint(1, spec.meta ?? 3) });
  } else {
    entries.push({
      name: spec.format === 'legacy2' ? 'collection.anki21' : 'collection.anki2',
      data: collectionBytes(spec, false),
    });
    if (spec.format === 'legacy2') {
      // El formato compatible de Anki 2.1 trae también el relleno viejo.
      entries.push({ name: 'collection.anki2', data: placeholderCollection() });
    }
    entries.push({
      name: 'media',
      data: Buffer.from(
        JSON.stringify(Object.fromEntries(media.map((item, index) => [String(index), item.name]))),
      ),
    });
    media.forEach((item, index) => {
      entries.push({ name: String(index), data: item.data });
    });
  }
  return zip(entries);
}

// --- mazo-demo.apkg: 3 tarjetas y 5 repasos (CA-122, CA-124) ---

// Un instante a las 10:00 de Buenos Aires (13:00 UTC), en milisegundos.
/** @param {string} day dd/mm/aaaa */
export function ankiInstant(day, minute = 0) {
  const [d, m, y] = day.split('/').map(Number);
  return Date.UTC(y ?? 2027, (m ?? 1) - 1, d ?? 1, 13, minute, 0);
}

/** @param {Partial<AnkiDeckSpec>} [changes] @returns {AnkiDeckSpec} */
export function demoDeck(changes = {}) {
  return {
    format: 'latest',
    decks: [{ id: 1_767_225_600_001, name: 'Independencia' }],
    notes: [
      {
        id: 1_767_312_000_001,
        guid: 'Rt3n1a-andes',
        notetype: 'basic',
        fields: ['¿Quién encabezó el cruce de los Andes en 1817?', 'José de San Martín'],
        tags: ['independencia', 'demo'],
        cards: [
          {
            ord: 0,
            id: 1_767_312_000_101,
            reviews: [
              { id: ankiInstant('02/02/2027'), type: 0, ease: 3 },
              { id: ankiInstant('06/02/2027'), type: 1, ease: 4 },
            ],
          },
        ],
      },
      {
        id: 1_767_312_000_002,
        guid: 'Rt3n1a-bandera',
        notetype: 'basic',
        fields: [
          '¿Qué creó Manuel Belgrano en 1812?<br><img src="bandera.png">',
          'La bandera argentina',
        ],
        tags: ['independencia'],
        cards: [
          {
            ord: 0,
            id: 1_767_312_000_102,
            reviews: [
              { id: ankiInstant('10/02/2027'), type: 0, ease: 1 },
              { id: ankiInstant('11/02/2027'), type: 2, ease: 3 },
              // Una reprogramación a mano: no es un repaso y no cuenta.
              { id: ankiInstant('20/02/2027'), type: 4, ease: 0 },
            ],
          },
        ],
      },
      {
        id: 1_767_312_000_003,
        guid: 'Rt3n1a-tucuman',
        notetype: 'cloze',
        fields: ['La Independencia se declaró en {{c1::Tucumán}} el 9 de julio de 1816.', ''],
        tags: ['independencia'],
        cards: [
          {
            ord: 0,
            id: 1_767_312_000_103,
            reviews: [{ id: ankiInstant('01/03/2027'), type: 0, ease: 2 }],
          },
        ],
      },
    ],
    media: [{ name: 'bandera.png', data: FLAG_PNG() }],
    ...changes,
  };
}

// --- remnote-demo.zip: 12 notas, 8 tarjetas, 1 imagen faltante (CA-123) ---

/** Los documentos de la exportación, con su ruta dentro del comprimido. */
export function demoRemnoteFiles() {
  /** @type {{ name: string, data: Buffer }[]} */
  const files = [];
  /** @param {string} name @param {string[]} lines */
  const md = (name, lines) =>
    files.push({ name, data: Buffer.from(`${lines.join('\n')}\n`, 'utf8') });
  md('Independencia/Congreso de Tucumán.md', [
    '- El Congreso se reunió en San Miguel de Tucumán.',
    '\t- ¿En qué año se declaró la Independencia? >> 1816',
    '\t- Los diputados venían de varias provincias.',
    '\t\t- Algunas provincias no enviaron diputados.',
    '- La declaración se firmó el {{9 de julio}} en la casa de {{Francisca Bazán de Laguna}}.',
  ]);
  md('Independencia/Cruce de los Andes.md', [
    '- San Martín organizó el Ejército de los Andes en Mendoza.',
    '\t- Ejército de los Andes :: La fuerza que cruzó la cordillera en 1817',
    '\t- ![Mapa del cruce](files/mapa-del-cruce.png)',
    '- Ver también [[Congreso de Tucumán]]',
  ]);
  md('Independencia/Belgrano.md', [
    '- ¿Dónde se izó por primera vez la bandera? >> En Rosario, a orillas del Paraná',
    '- ![Escudo](files/escudo.png)',
  ]);
  md('Independencia/Güemes.md', [
    '- ¿Quién defendió la frontera norte? >> Martín Miguel de Güemes',
    '\t- Con sus gauchos frenó a los ejércitos realistas.',
  ]);
  md('Independencia/Declaración.md', [
    '- El acta se escribió en castellano, quechua y aimara.',
    '\t- Se repartió en las provincias.',
  ]);
  md('Independencia/Provincias Unidas.md', [
    '- Las Provincias Unidas en Sud América fue el nombre de la época.',
  ]);
  md('Revolución de Mayo/Semana de Mayo.md', [
    '- ¿Qué se formó el 25 de mayo de 1810? >> La Primera Junta',
    '\t- Entre la Revolución y la Independencia pasaron $1816 - 1810 = 6$ años.',
  ]);
  md('Revolución de Mayo/Cabildo abierto.md', [
    '- El 22 de mayo se reunió un cabildo abierto.',
    '\t- Votaron los vecinos principales.',
  ]);
  md('Revolución de Mayo/Primera Junta.md', [
    '- Miembros de la Primera Junta >>>',
    '\t- Cornelio Saavedra',
    '\t- Mariano Moreno',
  ]);
  md('Revolución de Mayo/Moreno.md', ['- Mariano Moreno fue secretario de la Primera Junta.']);
  md('Revolución de Mayo/Castelli.md', ['- Juan José Castelli encabezó la campaña al Alto Perú.']);
  md('Revolución de Mayo/Larrea.md', ['- Juan Larrea era vocal de la Primera Junta.']);
  files.push({ name: 'Independencia/files/escudo.png', data: SHIELD_PNG() });
  return files;
}

export function demoRemnoteZip() {
  return zip(demoRemnoteFiles());
}
