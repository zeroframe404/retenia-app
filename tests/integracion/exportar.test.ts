import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import yauzl from 'yauzl';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace, type Space } from '../apoyo/espacio';
import {
  openTransfers,
  outsideFolder,
  previewOf,
  removeOutsideFolders,
  sample,
} from '../apoyo/importar';

// «Exportar todo» e «Importar exportación» (H-30): un comprimido abierto (apuntes en Markdown,
// tarjetas, historial, operaciones, originales, imágenes e índice), sin la clave de IA ni los
// modelos, y con él se reconstruye un Retenia vacío con los mismos conteos y 0 diferencias.

afterEach(() => {
  closeSpaces();
  removeOutsideFolders();
});

// Todas las entradas de un comprimido, con su contenido.
function entriesOf(file: string): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, archive) => {
      if (error || !archive) {
        reject(error);
        return;
      }
      const found = new Map<string, Buffer>();
      archive.on('entry', (entry: yauzl.Entry) => {
        if (entry.fileName.endsWith('/')) {
          archive.readEntry();
          return;
        }
        archive.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            reject(streamError);
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            found.set(entry.fileName, Buffer.concat(chunks));
            archive.readEntry();
          });
        });
      });
      archive.on('end', () => resolve(found));
      archive.readEntry();
    });
  });
}

const historySubject = (space: Space) => {
  const found = space.workspace.subjects
    .list()
    .subjects.find((subject) => subject.name === 'Historia argentina');
  if (!found) {
    throw new Error('falta Historia argentina en el elenco');
  }
  return found.id;
};

// El elenco con lo importado de Anki y de RemNote: todo lo que hay en esta fase.
async function fullSpace(): Promise<Space> {
  const space = openSpace({ withCast: true });
  const transfers = openTransfers(space);
  const subjectId = historySubject(space);
  for (const [kind, file] of [
    ['anki', 'mazo-demo.apkg'],
    ['remnote', 'remnote-demo.zip'],
  ] as const) {
    const preview = await previewOf(transfers, kind, sample(file));
    await transfers.run({
      previewId: preview.previewId,
      destination: { kind: 'subject', subjectId },
    });
  }
  return space;
}

// Una clave de IA falsa y unos modelos de voz, donde viven de verdad: nunca viajan.
const FAKE_KEY = 'sk-ant-api03-RETENIA-CLAVE-FALSA-DE-PRUEBA-0000000000000000000000';
function plantSecrets(space: Space): void {
  writeFileSync(join(space.dataDir, 'clave.bin'), FAKE_KEY);
  mkdirSync(join(space.dataDir, 'modelos'), { recursive: true });
  writeFileSync(join(space.dataDir, 'modelos', 'voz.onnx'), `modelo ${FAKE_KEY}`);
}

describe('Exportar todo', () => {
  it('[CA-127] el comprimido trae los apuntes en Markdown, las tarjetas, el historial, los originales y el índice', async () => {
    const space = await fullSpace();
    const file = join(outsideFolder(), 'Retenia.zip');
    const result = await openTransfers(space).exportAll({ file });
    const entries = await entriesOf(result.file);
    const names = [...entries.keys()];
    for (const name of ['indice.json', 'tarjetas.json', 'historial.jsonl', 'operaciones.jsonl']) {
      expect(names).toContain(name);
    }
    expect(names.some((name) => /^apuntes\/.+\.md$/.test(name))).toBe(true);
    expect(names).toContain('originales/Inferencia — capítulos 1 a 4.pdf');
    expect(names.some((name) => name.startsWith('imagenes/'))).toBe(true);
    const index = JSON.parse(String(entries.get('indice.json'))) as {
      format: string;
      counts: Record<string, number>;
      files: { path: string; sha256: string; bytes: number }[];
    };
    expect(index.format).toBe('retenia-exportacion');
    expect(index.counts.subjects).toBe(space.workspace.subjects.list().subjects.length);
    expect(index.counts.cards).toBe(space.workspace.cards.count());
    expect(result.counts).toEqual(index.counts);
    // Cada archivo listado en el índice está, con su tamaño.
    for (const listed of index.files) {
      expect(entries.get(listed.path)?.length).toBe(listed.bytes);
    }
  });

  it('[CA-127] el apunte es Markdown común, con su encabezado de datos', async () => {
    const space = await fullSpace();
    const result = await openTransfers(space).exportAll({ file: join(outsideFolder(), 'R.zip') });
    const entries = await entriesOf(result.file);
    const congress = [...entries].find(([name]) =>
      name.endsWith('/Independencia/Congreso de Tucumán.md'),
    );
    const text = String(congress?.[1]);
    expect(text).toMatch(
      /^---\nid: [0-9a-f-]{36}\nmateria: Historia argentina\ntema: Independencia\n/,
    );
    expect(text).toContain(
      '- El Congreso se reunió en San Miguel de Tucumán.\n\t- ¿En qué año se declaró la Independencia? >> 1816\n',
    );
    expect(text).toContain('{{9 de julio}}');
  });

  it('[CA-127] no viajan la clave de IA ni los modelos: ningún byte de la exportación la contiene', async () => {
    const space = await fullSpace();
    plantSecrets(space);
    const result = await openTransfers(space).exportAll({ file: join(outsideFolder(), 'R.zip') });
    const entries = await entriesOf(result.file);
    for (const [name, data] of entries) {
      expect(name).not.toMatch(/clave\.bin|modelos\//);
      expect(data.includes(Buffer.from(FAKE_KEY))).toBe(false);
      // Los patrones de claves de los proveedores (como los del escáner de secretos de la red).
      expect(/sk-ant-[a-z0-9]{2,}-[A-Za-z0-9_-]{20,}/.test(data.toString('latin1'))).toBe(false);
    }
  });

  it('[CA-379] las imágenes están en el archivo y el Markdown conserva las fórmulas y los enlaces', async () => {
    const space = await fullSpace();
    const result = await openTransfers(space).exportAll({ file: join(outsideFolder(), 'R.zip') });
    const entries = await entriesOf(result.file);
    const [, note] =
      [...entries].find(([name]) =>
        name.endsWith('/Intervalos de confianza/Intervalos de confianza.md'),
      ) ?? [];
    const text = String(note);
    expect(text).toContain('$\\bar{x} \\pm t \\cdot s/\\sqrt{n}$');
    expect(text).toMatch(/\[\[Media y dispersión\]\]\{nota=[0-9a-f-]{36}\}/);
    const image = /!\[[^\]]*\]\(((?:\.\.\/)+imagenes\/[0-9a-f]{64}\.png)\)/.exec(text);
    expect(image).not.toBeNull();
    const imagePath = image?.[1]?.replace(/^(?:\.\.\/)+/, '') ?? '';
    expect(entries.get(imagePath)?.subarray(1, 4).toString('latin1')).toBe('PNG');
  });

  it('[CA-127] el historial trae cada evento, en líneas JSON, con su identificador', async () => {
    const space = await fullSpace();
    const result = await openTransfers(space).exportAll({ file: join(outsideFolder(), 'R.zip') });
    const entries = await entriesOf(result.file);
    const lines = String(entries.get('historial.jsonl'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { tabla: string; id: string });
    const observations = readRows(space.file, 'SELECT id FROM observations').length;
    const evaluations = readRows(space.file, 'SELECT id FROM evaluations').length;
    expect(lines.filter((line) => line.tabla === 'observations')).toHaveLength(observations);
    expect(lines.filter((line) => line.tabla === 'evaluations')).toHaveLength(evaluations);
  });
});

describe('Importar exportación', () => {
  it('[CA-128] en un Retenia vacío deja los mismos conteos, el mismo historial evento por evento y 0 diferencias', async () => {
    const origin = await fullSpace();
    const exported = await openTransfers(origin).exportAll({
      file: join(outsideFolder(), 'R.zip'),
    });
    const target = openSpace();
    const transfers = openTransfers(target);
    const preview = await transfers.previewExport({ path: exported.file });
    if (preview.outcome !== 'preview') {
      throw new Error(preview.problem);
    }
    expect(preview.counts).toEqual(exported.counts);
    const loaded = await transfers.loadExport({ previewId: preview.previewId });
    expect(loaded.counts).toEqual(exported.counts);
    for (const table of ['observations', 'evaluations', 'operations']) {
      const sql = `SELECT * FROM ${table} ORDER BY id`;
      expect(readRows(target.file, sql)).toEqual(readRows(origin.file, sql));
    }
    for (const table of [
      'subjects',
      'topics',
      'notes',
      'blocks',
      'block_versions',
      'cards',
      'card_versions',
      'images',
      'materials',
      'imports',
      'import_items',
    ]) {
      const sql = `SELECT * FROM ${table} ORDER BY 1`;
      expect(readRows(target.file, sql)).toEqual(readRows(origin.file, sql));
    }
    expect(target.workspace.verifyData()).toEqual([]);
    expect(target.workspace.cards.count()).toBe(origin.workspace.cards.count());
  });

  it('[CA-379] las notas con imágenes, fórmulas y enlaces quedan iguales que en el origen', async () => {
    const origin = await fullSpace();
    const exported = await openTransfers(origin).exportAll({
      file: join(outsideFolder(), 'R.zip'),
    });
    const target = openSpace();
    const transfers = openTransfers(target);
    const preview = await transfers.previewExport({ path: exported.file });
    if (preview.outcome !== 'preview') {
      throw new Error(preview.problem);
    }
    await transfers.loadExport({ previewId: preview.previewId });
    const [row] = readRows(
      origin.file,
      "SELECT id FROM notes WHERE title = 'Intervalos de confianza'",
    );
    const noteId = String(row?.id);
    expect(target.workspace.notes.get({ noteId })).toEqual(origin.workspace.notes.get({ noteId }));
    const files = readRows(target.file, 'SELECT sha256 FROM images').map((image) =>
      String(image.sha256),
    );
    const { existsSync } = await import('node:fs');
    for (const sha of files) {
      expect(existsSync(join(target.dataDir, 'imagenes', sha))).toBe(true);
    }
  });

  it('[CA-128] en un Retenia con datos se niega y no toca nada', async () => {
    const origin = await fullSpace();
    const exported = await openTransfers(origin).exportAll({
      file: join(outsideFolder(), 'R.zip'),
    });
    const target = openSpace({ withCast: true });
    expect(await openTransfers(target).previewExport({ path: exported.file })).toEqual({
      outcome: 'problem',
      problem: 'notEmpty',
    });
  });

  it('[CA-128] una exportación alterada se rechaza sin escribir nada', async () => {
    const origin = await fullSpace();
    const exported = await openTransfers(origin).exportAll({
      file: join(outsideFolder(), 'R.zip'),
    });
    const entries = await entriesOf(exported.file);
    const { zip } = await import('../../tools/datos-de-ejemplo/zip.mjs');
    const tampered = [...entries].map(([name, data]) => ({
      name,
      data: name === 'tarjetas.json' ? Buffer.concat([data, Buffer.from(' ')]) : data,
    }));
    const file = join(outsideFolder(), 'alterada.zip');
    writeFileSync(file, zip(tampered));
    const target = openSpace();
    expect(await openTransfers(target).previewExport({ path: file })).toEqual({
      outcome: 'problem',
      problem: 'damaged',
    });
    expect(target.workspace.cards.count()).toBe(0);
  });

  it('[CA-128] una exportación de una versión más nueva de Retenia se rechaza', async () => {
    const origin = await fullSpace();
    const exported = await openTransfers(origin).exportAll({
      file: join(outsideFolder(), 'R.zip'),
    });
    const entries = await entriesOf(exported.file);
    const index = JSON.parse(String(entries.get('indice.json'))) as { formatVersion: number };
    index.formatVersion = 99;
    const { zip } = await import('../../tools/datos-de-ejemplo/zip.mjs');
    const file = join(outsideFolder(), 'nueva.zip');
    writeFileSync(
      file,
      zip(
        [...entries].map(([name, data]) => ({
          name,
          data: name === 'indice.json' ? Buffer.from(JSON.stringify(index)) : data,
        })),
      ),
    );
    expect(await openTransfers(openSpace()).previewExport({ path: file })).toEqual({
      outcome: 'problem',
      problem: 'tooNew',
    });
  });
});
