import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import yauzl from 'yauzl';
import { listBackupFiles } from '../../src/data/backups';
import { ankiPackage, demoDeck } from '../../tools/datos-de-ejemplo/importaciones.mjs';
import { zip } from '../../tools/datos-de-ejemplo/zip.mjs';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';
import {
  openTransfers,
  outsideFolder,
  previewOf,
  removeOutsideFolders,
  writeOutside,
} from '../apoyo/importar';

// Las objeciones del revisor independiente de la Fase 15, cada una con su prueba (en rojo antes del
// arreglo).

afterEach(() => {
  closeSpaces();
  removeOutsideFolders();
});

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

function entriesOf(file: string): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (error, archive) => {
      if (error || !archive) {
        reject(error);
        return;
      }
      const found = new Map<string, Buffer>();
      archive.on('entry', (entry: yauzl.Entry) => {
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

// Una exportación armada a mano (como la armaría alguien que quiere dañar), con su índice al día.
function craftedExport(files: { name: string; data: Buffer; kind: string }[]): string {
  const index = {
    format: 'retenia-exportacion',
    formatVersion: 1,
    appVersion: '0.0.0',
    exportedAt: '2027-03-15T13:00:00.000Z',
    migrations: ['0000_tarjetas'],
    counts: {
      subjects: 0,
      topics: 0,
      notes: 0,
      cards: 0,
      reviews: 0,
      materials: 1,
      images: 0,
      events: 0,
    },
    files: files.map((file) => ({
      path: file.name,
      sha256: sha256(file.data),
      bytes: file.data.length,
      kind: file.kind,
    })),
  };
  return writeOutside(
    'armada.zip',
    zip([
      { name: 'indice.json', data: Buffer.from(JSON.stringify(index)) },
      ...files.map(({ name, data }) => ({ name, data })),
    ]),
  );
}

describe('objeción 1 · «Importar exportación» no escribe fuera de la carpeta de datos', () => {
  it('[CA-128] una extensión de original con «..» se rechaza como dañada antes de copiar nada', async () => {
    const space = openSpace();
    const original = Buffer.from('%PDF-1.7 trampa');
    const row = {
      tabla: 'materials',
      id: '0195f000-0000-7000-8000-000000000001',
      subject_id: '0195f000-0000-7000-8000-000000000002',
      title: 'x',
      original_sha256: sha256(original),
      original_ext: 'pdf/../../../ESCAPADO.txt',
    };
    const file = craftedExport([
      { name: 'originales/x.pdf', data: original, kind: 'original' },
      {
        name: 'datos/contenido.jsonl',
        data: Buffer.from(`${JSON.stringify(row)}\n`),
        kind: 'data',
      },
    ]);
    const transfers = openTransfers(space);
    expect(await transfers.previewExport({ path: file })).toEqual({
      outcome: 'problem',
      problem: 'damaged',
    });
    const around = dirname(space.dataDir);
    expect(readdirSync(around).some((name) => name.includes('ESCAPADO'))).toBe(false);
    expect(existsSync(join(space.dataDir, 'ESCAPADO.txt'))).toBe(false);
  });
});

describe('objeción 2 · un texto largo en un rechazo o una anotación no tumba la importación', () => {
  it('[CA-123] un renglón larguísimo que entra como texto común se anota recortado', async () => {
    const space = openSpace({ withCast: true });
    const line = `- ${'palabra '.repeat(200)} Miembros >>>\n`;
    const file = writeOutside('largo.zip', zip([{ name: 'Largo.md', data: Buffer.from(line) }]));
    const preview = await previewOf(openTransfers(space), 'remnote', file);
    expect(preview.annotated).toHaveLength(1);
    expect(preview.annotated[0]?.what.length).toBeLessThanOrEqual(200);
  });

  it('[CA-122] una imagen de datos de 4000 caracteres que no está se rechaza con su motivo, recortada', async () => {
    const space = openSpace({ withCast: true });
    const deck = demoDeck();
    const first = deck.notes[0];
    if (first) {
      first.fields[1] = `San Martín <img src="data:image/png;base64,${'A'.repeat(4000)}">`;
    }
    const preview = await previewOf(
      openTransfers(space),
      'anki',
      writeOutside('dato.apkg', ankiPackage(deck)),
    );
    expect(preview.rejected).toHaveLength(1);
    expect(preview.rejected[0]?.reason).toBe('missingImage');
    expect(preview.rejected[0]?.what.length).toBeLessThanOrEqual(200);
  });
});

describe('objeción 4 · los campos de Anki que la plantilla no muestra no se pierden', () => {
  it('[CA-122] el «Extra» de una cloze queda en la explicación de la tarjeta', async () => {
    const space = openSpace({ withCast: true });
    const deck = demoDeck();
    const cloze = deck.notes[2];
    if (cloze) {
      cloze.fields[1] = 'Dato extra importante';
    }
    const transfers = openTransfers(space);
    const preview = await previewOf(
      transfers,
      'anki',
      writeOutside('extra.apkg', ankiPackage(deck)),
    );
    await transfers.run({
      previewId: preview.previewId,
      destination: { kind: 'new', name: 'Prueba de migración' },
    });
    const [row] = readRows(
      space.file,
      "SELECT explanation FROM card_versions WHERE question LIKE 'La Independencia se declaró en%'",
    );
    expect(row?.explanation).toBe('Extra: Dato extra importante');
  });
});

describe('objeción 5 · ninguna tarjeta de Anki desaparece sin motivo', () => {
  it('[CA-122] una tarjeta sin su nota y una nota repetida se rechazan, y lo demás se importa', async () => {
    const space = openSpace({ withCast: true });
    const deck = demoDeck({
      format: 'legacy2',
      extraSql: [
        "INSERT INTO cards VALUES (99, 999, 1767225600001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '')",
      ],
    });
    const twin = deck.notes[0];
    if (twin) {
      deck.notes.push({
        ...twin,
        id: 1_767_312_000_009,
        cards: [{ ord: 0, id: 1_767_312_000_109, reviews: [] }],
      });
    }
    const transfers = openTransfers(space);
    const preview = await previewOf(
      transfers,
      'anki',
      writeOutside('roto.apkg', ankiPackage(deck)),
    );
    expect(preview.counts.cards.fresh).toBe(3);
    expect(preview.rejected.map((item) => item.reason).sort()).toEqual([
      'duplicate',
      'unsupportedCard',
    ]);
    const result = await transfers.run({
      previewId: preview.previewId,
      destination: { kind: 'new', name: 'Prueba de migración' },
    });
    expect(result.counts.cards.fresh).toBe(3);
  });
});

describe('objeción 3 · el código de RemNote no arma tarjetas', () => {
  it('[CA-123] lo que está entre ``` entra como texto común, sin tarjetas', async () => {
    const space = openSpace({ withCast: true });
    const text = '- Ejemplo:\n```cpp\nstd::cout << "hola";\nint x = a == b;\n```\n';
    const file = writeOutside('codigo.zip', zip([{ name: 'Código.md', data: Buffer.from(text) }]));
    const preview = await previewOf(openTransfers(space), 'remnote', file);
    expect(preview.counts.cards.fresh).toBe(0);
  });
});

describe('objeción 8 · cargar una exportación y la bomba del formato actual', () => {
  async function exported() {
    const origin = openSpace({ withCast: true });
    const file = join(outsideFolder(), 'R.zip');
    await openTransfers(origin).exportAll({ file });
    return file;
  }

  it('[CA-126] cargar una exportación hace antes la copia «Antes de importar»', async () => {
    const file = await exported();
    const target = openSpace();
    const transfers = openTransfers(target);
    const preview = await transfers.previewExport({ path: file });
    if (preview.outcome !== 'preview') {
      throw new Error(preview.problem);
    }
    await transfers.loadExport({ previewId: preview.previewId });
    expect(
      listBackupFiles(target.workspace.copiesDir).filter(
        ({ view }) => view.readable && view.kind === 'before_import',
      ),
    ).toHaveLength(1);
  });

  it('[CA-128] si la carga falla a mitad, Retenia queda vacío', async () => {
    const file = await exported();
    const target = openSpace();
    let inserted = 0;
    const failing = target.reopenWith({
      onStatement: (statement) => {
        if (/^insert into "cards"/i.test(statement)) {
          inserted += 1;
          if (inserted === 50) {
            throw new Error('(simulado) el disco se llenó');
          }
        }
      },
    });
    const transfers = openTransfers({ workspace: failing, clock: target.clock });
    const preview = await transfers.previewExport({ path: file });
    if (preview.outcome !== 'preview') {
      throw new Error(preview.problem);
    }
    await expect(transfers.loadExport({ previewId: preview.previewId })).rejects.toThrow();
    expect(failing.isEmpty()).toBe(true);
    expect(readRows(target.file, 'SELECT count(*) AS n FROM observations')[0]).toEqual({ n: 0 });
  });

  it('[CA-122] una bomba en la colección del formato actual se corta y se rechaza', async () => {
    const space = openSpace({ withCast: true });
    const bomb = zip([
      { name: 'collection.anki21b', data: zstdCompressSync(Buffer.alloc(40 * 1024 * 1024)) },
      { name: 'meta', data: Buffer.from([8, 3]) },
    ]);
    expect(
      await openTransfers(space, { maxBytes: 20 * 1024 * 1024 }).preview({
        kind: 'anki',
        path: writeOutside('bomba-nueva.apkg', bomb),
      }),
    ).toEqual({ outcome: 'problem', problem: 'unsafe' });
  });

  it('[CA-122] varios medios que juntos se pasan del tope también se cortan', async () => {
    const space = openSpace({ withCast: true });
    const deck = demoDeck({
      media: [
        { name: 'a.png', data: Buffer.alloc(12 * 1024 * 1024) },
        { name: 'b.png', data: Buffer.alloc(12 * 1024 * 1024) },
      ],
    });
    expect(
      await openTransfers(space, { maxBytes: 20 * 1024 * 1024 }).preview({
        kind: 'anki',
        path: writeOutside('medios.apkg', ankiPackage(deck)),
      }),
    ).toEqual({ outcome: 'problem', problem: 'unsafe' });
  });
});

describe('objeción 10 · la exportación dice si falta un archivo', () => {
  it('[CA-379] una imagen que falta en la carpeta de datos se informa y queda anotada en el índice', async () => {
    const space = openSpace({ withCast: true });
    const [image] = readRows(space.file, 'SELECT sha256 FROM images');
    rmSync(join(space.dataDir, 'imagenes', String(image?.sha256)));
    const result = await openTransfers(space).exportAll({ file: join(outsideFolder(), 'R.zip') });
    expect(result.missing).toBe(1);
    const entries = await entriesOf(result.file);
    const index = JSON.parse(String(entries.get('indice.json'))) as { missing: string[] };
    expect(index.missing).toEqual([`imagenes/${String(image?.sha256)}.png`]);
  });
});

describe('objeción 11 · un comprimido con un archivo y una carpeta del mismo nombre', () => {
  it('[CA-128] se rechaza como no seguro, sin que se caiga el proceso', async () => {
    const space = openSpace();
    const file = writeOutside(
      'choque.zip',
      zip([
        { name: 'indice.json', data: Buffer.from('{}') },
        { name: 'a', data: Buffer.from('x') },
        { name: 'a/b.md', data: Buffer.from('y') },
      ]),
    );
    expect(await openTransfers(space).previewExport({ path: file })).toEqual({
      outcome: 'problem',
      problem: 'unsafe',
    });
  });
});

describe('objeción 7 · leer la colección no la cambia', () => {
  it('[CA-122] la colección se abre de solo lectura: el archivo queda igual byte por byte', async () => {
    const space = openSpace({ withCast: true });
    const file = writeOutside('igual.apkg', ankiPackage(demoDeck({ format: 'legacy2' })));
    const before = readFileSync(file);
    await previewOf(openTransfers(space), 'anki', file);
    expect(readFileSync(file).equals(before)).toBe(true);
    writeFileSync(join(outsideFolder(), 'nada'), '');
  });
});
