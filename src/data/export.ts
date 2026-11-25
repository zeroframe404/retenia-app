import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { z } from 'zod';
import type { Clock } from '../core/clock';
import {
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  type ExportCounts,
  type ExportFile,
  type ExportIndex,
  type MarkdownNode,
  noteMarkdown,
  safeFileName,
} from '../core/imports/markdown';
import type { ReteniaDatabase } from './database';
import { newId } from './ids';
import { continueSequence, readLedgerState } from './ledger';
import { migrationIds } from './migrations';
import { repairData } from './projections';

// «Exportar todo» e «Importar exportación» (H-30). La exportación lleva todo lo tuyo en un formato
// abierto: los apuntes en Markdown, las tarjetas (tarjetas/tarjetas-y-relaciones.json), el historial completo
// (historial/eventos.jsonl: observaciones y evaluaciones) y el registro de operaciones
// (historial/operaciones.jsonl),
// los originales de los materiales, las imágenes, los audios y un índice (indice.json) con los
// conteos y la huella de cada archivo. El resto de las tablas va fila por fila en
// datos/contenido.jsonl: con eso «Importar exportación» reconstruye un Retenia vacío por
// identificadores. Nunca viajan la clave de IA (vive en el almacén del sistema, no en la base) ni
// los modelos descargados.

// Las que se exportan, en el orden en que se cargan (los eventos al final, en su orden canónico).
export const EXPORTED_TABLES = [
  'subjects',
  'topics',
  'topic_aliases',
  'notes',
  'blocks',
  'block_versions',
  'block_links',
  'images',
  'cards',
  'card_versions',
  'trash_entries',
  'inbox_items',
  'doubts',
  'session_drafts',
  'settings',
  'search_recent',
  'materials',
  'material_units',
  'material_blocks',
  'block_corrections',
  'problem_resolutions',
  'ingest_results',
  'ingest_tasks',
  'attachments',
  'card_attachments',
  'imports',
  'import_items',
  // Fase 17: los objetivos (sus enlaces, requisitos y demás son eventos).
  'objectives',
  'observations',
  'evaluations',
  'operations',
] as const;

// Las que no se exportan, con su motivo.
export const EXCLUDED_TABLES: Record<string, string> = {
  card_schedule: 'La agenda de cada tarjeta se recalcula desde el historial.',
  search_documents: 'El índice de búsqueda se vuelve a armar desde el contenido.',
  search_dirty:
    'Es la lista de pendientes del índice de búsqueda: siempre vacía entre transacciones.',
  ledger_state: 'Es de cada instalación: el dispositivo y su número de secuencia.',
  purge_permits: 'Siempre vacía fuera de la transacción que vacía la Papelera.',
};

const HISTORY_TABLES = new Set(['observations', 'evaluations']);
const OPERATION_TABLES = new Set(['operations']);
const ORDER_BY: Record<string, string> = {
  observations: 'seq, id',
  evaluations: 'seq, id',
  operations: 'seq, id',
};

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

type Row = Record<string, unknown>;

// Una fila como JSON: los bytes (el resultado comprimido de una etapa) van en base64.
function encodeRow(table: string, row: Row): string {
  const out: Row = { tabla: table };
  for (const [column, value] of Object.entries(row)) {
    out[column] = Buffer.isBuffer(value) ? { $base64: value.toString('base64') } : value;
  }
  return JSON.stringify(out);
}

function decodeValue(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && '$base64' in value) {
    return Buffer.from(String((value as { $base64: unknown }).$base64), 'base64');
  }
  return value;
}

// Las columnas guardadas de una tabla (sin las calculadas, que la base arma sola).
function storedColumns(raw: ReteniaDatabase['raw'], table: string): string {
  return (raw.prepare(`PRAGMA table_xinfo("${table}")`).all() as { name: string; hidden: number }[])
    .filter((column) => column.hidden === 0)
    .map((column) => `"${column.name}"`)
    .join(', ');
}

const sha256Of = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

function writeData(
  staging: string,
  path: string,
  data: string,
  kind: ExportFile['kind'],
  files: ExportFile[],
) {
  const target = join(staging, path);
  mkdirSync(dirname(target), { recursive: true });
  const bytes = Buffer.from(data, 'utf8');
  writeFileSync(target, bytes);
  files.push({ path, sha256: sha256Of(bytes), bytes: bytes.length, kind });
}

export function exportCounts(db: ReteniaDatabase): ExportCounts {
  const raw = db.raw;
  const count = (sql: string) => Number((raw.prepare(sql).get() as { n: number }).n);
  return {
    subjects: count('SELECT count(*) AS n FROM subjects WHERE deleted_at IS NULL'),
    topics: count('SELECT count(*) AS n FROM topics WHERE deleted_at IS NULL'),
    notes: count('SELECT count(*) AS n FROM notes WHERE deleted_at IS NULL'),
    // Las tarjetas: los ejercicios (Fase 16) viajan igual, pero no se cuentan como tarjetas.
    cards: count(
      'SELECT count(*) AS n FROM cards JOIN card_versions ON card_versions.id = cards.current_version_id WHERE card_versions.activity_type IS NULL',
    ),
    reviews: count("SELECT count(*) AS n FROM observations WHERE kind = 'review.graded'"),
    materials: count('SELECT count(*) AS n FROM materials WHERE deleted_at IS NULL'),
    images: count('SELECT count(*) AS n FROM images'),
    events: count(
      'SELECT (SELECT count(*) FROM observations) + (SELECT count(*) FROM evaluations) + (SELECT count(*) FROM operations) AS n',
    ),
  };
}

// Una base vacía: ni materias, ni tarjetas, ni notas, ni materiales, ni historial.
export function isEmptyDatabase(db: ReteniaDatabase): boolean {
  const raw = db.raw;
  return ['subjects', 'cards', 'notes', 'materials', 'observations', 'inbox_items'].every(
    (table) => (raw.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n === 0,
  );
}

export interface StagedExport {
  index: ExportIndex;
  // Lo que va al comprimido: la ruta adentro y el archivo de donde sale.
  entries: { zipPath: string; from: string }[];
}

// Arma en `staging` los archivos de datos de la exportación (todo con una sola lectura consistente
// de la base) y la lista de lo que va al comprimido, con los originales y las imágenes de la carpeta
// de datos.
export function stageExport(
  db: ReteniaDatabase,
  {
    dataDir,
    staging,
    appVersion,
    clock,
  }: { dataDir: string; staging: string; appVersion: string; clock: Clock },
): StagedExport {
  const raw = db.raw;
  const files: ExportFile[] = [];
  const missing: string[] = [];
  const entries: { zipPath: string; from: string }[] = [];
  mkdirSync(staging, { recursive: true });
  const read = raw.transaction(() => {
    const all = (sql: string) => raw.prepare(sql).all() as Row[];
    // Los datos, fila por fila.
    const history: string[] = [];
    const operations: string[] = [];
    const content: string[] = [];
    for (const table of EXPORTED_TABLES) {
      for (const row of all(
        `SELECT ${storedColumns(raw, table)} FROM "${table}" ORDER BY ${ORDER_BY[table] ?? 'rowid'}`,
      )) {
        const line = encodeRow(table, row);
        (HISTORY_TABLES.has(table)
          ? history
          : OPERATION_TABLES.has(table)
            ? operations
            : content
        ).push(line);
      }
    }
    writeData(
      staging,
      'historial/eventos.jsonl',
      history.length > 0 ? `${history.join('\n')}\n` : '',
      'data',
      files,
    );
    writeData(
      staging,
      'historial/operaciones.jsonl',
      operations.length > 0 ? `${operations.join('\n')}\n` : '',
      'data',
      files,
    );
    writeData(
      staging,
      'datos/contenido.jsonl',
      content.length > 0 ? `${content.join('\n')}\n` : '',
      'data',
      files,
    );

    // Las tarjetas, para leer: la versión vigente y sus relaciones.
    const subjectNames = new Map(
      all('SELECT id, name FROM subjects').map((row) => [String(row.id), String(row.name)]),
    );
    const topicNames = new Map(
      all('SELECT id, name FROM topics').map((row) => [String(row.id), String(row.name)]),
    );
    const audioOf = new Map<string, { nombre: string; archivo: string }[]>();
    for (const row of all(
      'SELECT card_attachments.card_id AS card, attachments.name AS name, attachments.sha256 AS sha FROM card_attachments JOIN attachments ON attachments.id = card_attachments.attachment_id',
    )) {
      const list = audioOf.get(String(row.card)) ?? [];
      list.push({ nombre: String(row.name), archivo: `adjuntos/${String(row.sha)}` });
      audioOf.set(String(row.card), list);
    }
    const activated = new Set(
      all("SELECT DISTINCT card_id AS id FROM observations WHERE kind = 'card.activated'").map(
        (row) => String(row.id),
      ),
    );
    const cardsJson = all(
      `SELECT cards.*, card_versions.question, card_versions.answer, card_versions.question_content,
        card_versions.answer_content, card_versions.reference_answer, card_versions.variants,
        card_versions.essentials, card_versions.hints, card_versions.explanation, card_versions.source_text,
        card_versions.source_cite, card_versions.form_type, card_versions.sheet_state,
        card_versions.activity_type, card_versions.activity, card_versions.example, card_versions.mode
       FROM cards JOIN card_versions ON card_versions.id = cards.current_version_id ORDER BY cards.created_at, cards.id`,
    ).map((row) => ({
      id: row.id,
      materia: row.subject_id === null ? null : (subjectNames.get(String(row.subject_id)) ?? null),
      tema: row.topic_id === null ? null : (topicNames.get(String(row.topic_id)) ?? null),
      tipo: row.kind === 'cloze' ? 'completar' : 'pregunta y respuesta',
      pregunta: row.question,
      respuesta: row.answer,
      contenidoPregunta:
        row.question_content === null ? null : JSON.parse(String(row.question_content)),
      contenidoRespuesta:
        row.answer_content === null ? null : JSON.parse(String(row.answer_content)),
      ficha: {
        respuestaDeReferencia: row.reference_answer,
        variantes: JSON.parse(String(row.variants)),
        esenciales: JSON.parse(String(row.essentials)),
        pistas: JSON.parse(String(row.hints)),
        explicacion: row.explanation,
        fuente: row.source_text,
        forma: row.form_type,
        estado: row.sheet_state,
      },
      cita: row.source_cite === null ? null : JSON.parse(String(row.source_cite)),
      // Fase 16: un ejercicio trae su tipo, lo propio del tipo, el ejemplo y el modo.
      actividad: row.activity === null ? null : JSON.parse(String(row.activity)),
      ejemplo: row.example,
      modo: row.mode === 'evaluation' ? 'evaluación' : 'práctica',
      relaciones: {
        nota: row.note_id,
        renglon: row.block_id,
        hueco: row.cloze_id,
        hermanas: row.sibling_group_id,
        inversaDe: row.inverse_of_card_id,
      },
      origen: row.origin,
      pausada: row.paused_at !== null,
      disponible: Number(row.available_only) === 1 && !activated.has(String(row.id)),
      audios: audioOf.get(String(row.id)) ?? [],
      creada: row.created_at,
      eliminada: row.deleted_at,
    }));
    writeData(
      staging,
      'tarjetas/tarjetas-y-relaciones.json',
      `${JSON.stringify(cardsJson, null, 2)}\n`,
      'data',
      files,
    );

    // Los apuntes en Markdown.
    const imageExtension = new Map(
      all('SELECT sha256, mime FROM images').map((row) => [
        String(row.sha256),
        IMAGE_EXTENSIONS[String(row.mime)] ?? 'img',
      ]),
    );
    const noteTitles = new Map(
      all('SELECT id, title FROM notes').map((row) => [String(row.id), String(row.title)]),
    );
    const usedPaths = new Set<string>();
    for (const note of all(
      'SELECT * FROM notes WHERE deleted_at IS NULL ORDER BY created_at, id',
    )) {
      const subject = subjectNames.get(String(note.subject_id)) ?? '';
      const topic = note.topic_id === null ? null : (topicNames.get(String(note.topic_id)) ?? null);
      const blocks = all(
        `SELECT blocks.id, blocks.parent_block_id, blocks.position, block_versions.content FROM blocks
         JOIN block_versions ON block_versions.id = blocks.current_version_id
         WHERE blocks.note_id = '${String(note.id).replaceAll("'", "''")}' AND blocks.deleted_at IS NULL`,
      ).map((row) => ({
        id: String(row.id),
        parentId: row.parent_block_id === null ? null : String(row.parent_block_id),
        position: Number(row.position),
        content: (JSON.parse(String(row.content)) as MarkdownNode[]).map((node) =>
          node.type === 'mention'
            ? { ...node, label: noteTitles.get(node.id ?? '') || (node.label ?? '') }
            : node,
        ),
      }));
      const folder = `apuntes/${safeFileName(subject, 'Sin materia')}/${safeFileName(topic ?? 'Sin tema', 'Sin tema')}`;
      const base = safeFileName(String(note.title), 'Sin título');
      let path = `${folder}/${base}.md`;
      for (let copy = 2; usedPaths.has(path.toLocaleLowerCase('es')); copy++) {
        path = `${folder}/${base} (${copy}).md`;
      }
      usedPaths.add(path.toLocaleLowerCase('es'));
      const text = noteMarkdown(
        {
          id: String(note.id),
          title: String(note.title),
          subject,
          topic,
          createdAt: String(note.created_at),
          archived: note.archived_at !== null,
          blocks,
        },
        { depth: 3, extensionOf: (sha) => imageExtension.get(sha) ?? 'img' },
      );
      writeData(staging, path, text, 'note', files);
    }

    // Los archivos de la carpeta de datos, con la huella que ya tienen por nombre.
    const add = (zipPath: string, from: string, sha: string, kind: ExportFile['kind']) => {
      if (!existsSync(from)) {
        missing.push(zipPath);
        return;
      }
      files.push({ path: zipPath, sha256: sha, bytes: statSync(from).size, kind });
      entries.push({ zipPath, from });
    };
    for (const [sha, extension] of imageExtension) {
      add(`imagenes/${sha}.${extension}`, join(dataDir, 'imagenes', sha), sha, 'image');
    }
    for (const row of all('SELECT sha256 FROM attachments')) {
      add(
        `adjuntos/${String(row.sha256)}`,
        join(dataDir, 'adjuntos', String(row.sha256)),
        String(row.sha256),
        'attachment',
      );
    }
    const originalNames = new Set<string>();
    for (const row of all(
      'SELECT original_sha256 AS sha, original_name AS name, original_ext AS ext FROM materials WHERE original_sha256 IS NOT NULL ORDER BY added_at, id',
    )) {
      const sha = String(row.sha);
      const ext = String(row.ext ?? '');
      const from = join(dataDir, 'originales', ext === '' ? sha : `${sha}.${ext}`);
      if (files.some((file) => file.kind === 'original' && file.sha256 === sha)) {
        continue;
      }
      const name = safeFileName(String(row.name ?? ''), `${sha}.${ext}`);
      let path = `originales/${name}`;
      for (let copy = 2; originalNames.has(path.toLocaleLowerCase('es')); copy++) {
        const dot = name.lastIndexOf('.');
        path = `originales/${dot > 0 ? `${name.slice(0, dot)} (${copy})${name.slice(dot)}` : `${name} (${copy})`}`;
      }
      originalNames.add(path.toLocaleLowerCase('es'));
      add(path, from, sha, 'original');
    }
    return exportCounts(db);
  });
  const counts = read.deferred();
  for (const file of files) {
    if (file.kind === 'data' || file.kind === 'note') {
      entries.push({ zipPath: file.path, from: join(staging, file.path) });
    }
  }
  const index: ExportIndex = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    appVersion,
    exportedAt: clock.now().toISOString(),
    migrations: migrationIds(),
    counts,
    files,
    ...(missing.length > 0 ? { missing } : {}),
  };
  writeFileSync(join(staging, 'indice.json'), `${JSON.stringify(index, null, 2)}\n`);
  entries.unshift({ zipPath: 'indice.json', from: join(staging, 'indice.json') });
  return { index, entries };
}

class ExportNotLoadableError extends Error {
  constructor(reason: string) {
    super(`No se puede cargar la exportación: ${reason}`);
    this.name = 'ExportNotLoadableError';
  }
}

const lineSchema = z.looseObject({ tabla: z.enum(EXPORTED_TABLES) });

// Carga una exportación ya revisada (cada archivo con su huella) en una base vacía, por
// identificadores, en una sola transacción. Los archivos (originales, imágenes, audios) se copian
// antes, por su huella. Al final la agenda de cada tarjeta se recalcula con el motor vigente y el
// índice de búsqueda se arma solo al confirmar.
export function loadStagedExport(
  db: ReteniaDatabase,
  { dataDir, staging, index }: { dataDir: string; staging: string; index: ExportIndex },
): ExportCounts {
  if (!isEmptyDatabase(db)) {
    throw new ExportNotLoadableError('la base no está vacía');
  }
  if (!isSafeStagedExport(staging)) {
    throw new ExportNotLoadableError('un dato que no es de Retenia');
  }
  const raw = db.raw;
  // Los archivos, a su lugar.
  const materials = new Map<string, string>();
  for (const line of readLines(join(staging, 'datos/contenido.jsonl'))) {
    if (line.tabla === 'materials' && typeof line.original_sha256 === 'string') {
      materials.set(line.original_sha256, String(line.original_ext ?? ''));
    }
  }
  for (const file of index.files) {
    const from = join(staging, file.path);
    if (file.kind === 'image') {
      placeFile(from, join(dataDir, 'imagenes', file.sha256));
    } else if (file.kind === 'attachment') {
      placeFile(from, join(dataDir, 'adjuntos', file.sha256));
    } else if (file.kind === 'original') {
      const ext = materials.get(file.sha256) ?? '';
      placeFile(
        from,
        join(dataDir, 'originales', ext === '' ? file.sha256 : `${file.sha256}.${ext}`),
      );
    }
  }
  const columns = new Map<string, Set<string>>();
  const columnsOf = (table: string) => {
    let known = columns.get(table);
    if (!known) {
      known = new Set(
        (raw.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(
          (row) => row.name,
        ),
      );
      columns.set(table, known);
    }
    return known;
  };
  const statements = new Map<string, BetterSqlite3.Statement<unknown[]>>();
  const insert = (line: Row & { tabla: string }) => {
    const { tabla, ...row } = line;
    const names = Object.keys(row);
    const known = columnsOf(tabla);
    for (const name of names) {
      if (!known.has(name)) {
        throw new ExportNotLoadableError(`una columna que no existe: ${tabla}.${name}`);
      }
    }
    const key = `${tabla}:${names.join(',')}`;
    let statement = statements.get(key);
    if (!statement) {
      statement = raw.prepare<unknown[]>(
        `INSERT ${tabla === 'settings' ? 'OR REPLACE ' : ''}INTO "${tabla}" (${names.map((name) => `"${name}"`).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
      );
      statements.set(key, statement);
    }
    statement.run(...names.map((name) => decodeValue(row[name])));
  };
  db.orm.transaction((tx) => {
    raw.pragma('defer_foreign_keys = ON');
    let lastSeq = 0;
    for (const file of [
      'datos/contenido.jsonl',
      'historial/eventos.jsonl',
      'historial/operaciones.jsonl',
    ]) {
      for (const line of readLines(join(staging, file))) {
        insert(line);
        if (typeof line.seq === 'number' && line.seq > lastSeq) {
          lastSeq = line.seq;
        }
      }
    }
    continueSequence(tx, { deviceId: readLedgerState(tx).deviceId, lastSeq });
    // La agenda de cada tarjeta, recalculada con el motor vigente desde el historial que llegó.
    repairData({ orm: tx });
  });
  return exportCounts(db);
}

const SHA = /^[0-9a-f]{64}$/;
// Las mismas extensiones con que Retenia guarda un original (src/main/materials/originals.ts).
const ORIGINAL_EXTENSION = /^(pdf|docx|md|txt|html)?$/;

// Antes de copiar un solo archivo (objeción 1 del revisor): cada renglón es de una tabla de Retenia,
// y lo que después se usa para armar una ruta (la huella y la extensión de un original, la huella de
// una imagen o un audio) tiene la forma de siempre. Una exportación armada a mano para escribir fuera
// de la carpeta de datos no pasa.
export function isSafeStagedExport(staging: string): boolean {
  try {
    for (const line of readLines(join(staging, 'datos/contenido.jsonl'))) {
      if (line.tabla === 'materials') {
        const sha = line.original_sha256;
        const ext = line.original_ext;
        if (
          (sha !== null && sha !== undefined && (typeof sha !== 'string' || !SHA.test(sha))) ||
          (ext !== null &&
            ext !== undefined &&
            (typeof ext !== 'string' || !ORIGINAL_EXTENSION.test(ext)))
        ) {
          return false;
        }
      }
      if (
        (line.tabla === 'images' || line.tabla === 'attachments') &&
        (typeof line.sha256 !== 'string' || !SHA.test(line.sha256))
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function* readLines(file: string): Generator<Row & { tabla: string }> {
  if (!existsSync(file)) {
    return;
  }
  for (const text of readFileSync(file, 'utf8').split('\n')) {
    if (text.trim() === '') {
      continue;
    }
    const parsed = lineSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      throw new ExportNotLoadableError('un renglón de datos que no es de Retenia');
    }
    yield parsed.data as Row & { tabla: string };
  }
}

function placeFile(from: string, target: string): void {
  if (existsSync(target)) {
    return;
  }
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.${newId()}.tmp`;
  try {
    copyFileSync(from, temporary);
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}
