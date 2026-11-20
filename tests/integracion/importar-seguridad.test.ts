import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_ZIP_LIMITS } from '../../src/main/workers/zip-reader';
import {
  ankiPackage,
  demoDeck,
  demoRemnoteFiles,
} from '../../tools/datos-de-ejemplo/importaciones.mjs';
import { zip } from '../../tools/datos-de-ejemplo/zip.mjs';
import { dumpTables } from '../apoyo/base-cruda';
import { closeSpaces, openSpace } from '../apoyo/espacio';
import {
  openTransfers,
  outsideFolder,
  previewOf,
  removeOutsideFolders,
  writeOutside,
} from '../apoyo/importar';

// Comprimidos y colecciones maliciosos (H-29, no-funcionales.md): nada de lo que trae un archivo
// importado se ejecuta ni escribe fuera de la carpeta de trabajo; lo que no es seguro se rechaza
// entero, con su motivo, antes de la vista previa, y la base no cambia.

afterEach(() => {
  closeSpaces();
  removeOutsideFolders();
});

function everything(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

// Pone una entrada con el nombre dado dentro de un zip válido (el resto, el de un mazo o el de
// RemNote).
function withEntry(kind: 'anki' | 'remnote', name: string, data = Buffer.from('x')) {
  const base =
    kind === 'remnote'
      ? demoRemnoteFiles()
      : [{ name: 'collection.anki21', data: Buffer.alloc(0) }];
  return zip([...base, { name, data }]);
}

describe('comprimidos trampa', () => {
  for (const [label, name] of [
    ['sube de carpeta', '../fuera-de-retenia.md'],
    ['absoluto', '/raiz-de-retenia.md'],
    ['con unidad', 'C:/unidad-de-retenia.md'],
    ['con barra invertida', 'a\\barra-de-retenia.md'],
    ['de red', '//servidor/compartido/red.md'],
  ] as const) {
    for (const kind of ['anki', 'remnote'] as const) {
      it(`[CA-123] ${kind}: un nombre ${label} se rechaza entero y no escribe nada en ningún lado`, async () => {
        const space = openSpace({ withCast: true });
        const file = writeOutside(`trampa-${kind}.zip`, withEntry(kind, name));
        const around = dirname(dirname(file));
        const before = dumpTables(space.file);
        const filesBefore = everything(space.dataDir);
        expect(await openTransfers(space).preview({ kind, path: file })).toEqual({
          outcome: 'problem',
          problem: 'unsafe',
        });
        expect(dumpTables(space.file)).toEqual(before);
        expect(everything(space.dataDir).filter((path) => !path.includes('tmp'))).toEqual(
          filesBefore.filter((path) => !path.includes('tmp')),
        );
        expect(readdirSync(around).some((entry) => entry.includes('-de-retenia'))).toBe(false);
      });
    }
  }

  it('[CA-123] dos entradas con el mismo nombre se rechazan', async () => {
    const space = openSpace({ withCast: true });
    const files = demoRemnoteFiles();
    const twice = zip([...files, files[0] ?? { name: 'a.md', data: Buffer.from('x') }]);
    expect(
      await openTransfers(space).preview({
        kind: 'remnote',
        path: writeOutside('doble.zip', twice),
      }),
    ).toEqual({
      outcome: 'problem',
      problem: 'unsafe',
    });
  });

  it('[CA-123] el tope de verdad es de 20.000 entradas por comprimido', () => {
    expect(DEFAULT_ZIP_LIMITS.maxEntries).toBe(20_000);
  });

  it('[CA-123] demasiadas entradas se rechazan', async () => {
    const space = openSpace({ withCast: true });
    // Con un tope chico (100), para no armar un comprimido de 20.001 entradas en cada corrida.
    const many = Array.from({ length: 101 }, (_, index) => ({
      name: `muchos/${index}.md`,
      data: Buffer.from('- x\n'),
    }));
    expect(
      await openTransfers(space, { maxEntries: 100 }).preview({
        kind: 'remnote',
        path: writeOutside('muchos.zip', zip(many)),
      }),
    ).toEqual({
      outcome: 'problem',
      problem: 'unsafe',
    });
  });

  it('[CA-122] una bomba (muy poco comprimido que se vuelve enorme) se corta al leer y se rechaza', async () => {
    const space = openSpace({ withCast: true });
    const bomb = zip([{ name: 'collection.anki21', data: Buffer.alloc(30 * 1024 * 1024) }]);
    expect(
      await openTransfers(space, { maxBytes: 20 * 1024 * 1024 }).preview({
        kind: 'anki',
        path: writeOutside('bomba.apkg', bomb),
      }),
    ).toEqual({
      outcome: 'problem',
      problem: 'unsafe',
    });
  }, 60_000);

  it('[CA-122] algo que no es un comprimido no es una exportación de Anki', async () => {
    const space = openSpace({ withCast: true });
    expect(
      await openTransfers(space).preview({ kind: 'anki', path: writeOutside('no.apkg', 'hola') }),
    ).toEqual({
      outcome: 'problem',
      problem: 'notAnki',
    });
  });
});

describe('colecciones de Anki trampa', () => {
  it('[CA-122] una colección que no es una base SQLite se rechaza como dañada', async () => {
    const space = openSpace({ withCast: true });
    const file = writeOutside(
      'rota.apkg',
      zip([{ name: 'collection.anki21', data: Buffer.from('no soy una base') }]),
    );
    expect(await openTransfers(space).preview({ kind: 'anki', path: file })).toEqual({
      outcome: 'problem',
      problem: 'damaged',
    });
  });

  it('[CA-122] si «notes» es una vista y no una tabla, se rechaza como dañada', async () => {
    const space = openSpace({ withCast: true });
    const deck = demoDeck({
      format: 'legacy2',
      extraSql: [
        'ALTER TABLE notes RENAME TO notes_reales',
        'CREATE VIEW notes AS SELECT * FROM notes_reales',
      ],
    });
    expect(
      await openTransfers(space).preview({
        kind: 'anki',
        path: writeOutside('vista.apkg', ankiPackage(deck)),
      }),
    ).toEqual({
      outcome: 'problem',
      problem: 'damaged',
    });
  });

  it('[CA-122] una colección con disparadores y vistas de más se lee igual y no escribe nada afuera (que se abre de solo lectura lo prueba «leer la colección no la cambia»)', async () => {
    const space = openSpace({ withCast: true });
    const outside = outsideFolder();
    const target = join(outside, 'escrito-por-el-mazo.db').replaceAll("'", "''");
    const deck = demoDeck({
      format: 'legacy2',
      extraSql: [
        `CREATE TRIGGER trampa AFTER UPDATE ON notes BEGIN SELECT load_extension('x'); END`,
        `CREATE VIEW espia AS SELECT '${target}' AS ruta`,
      ],
    });
    const preview = await previewOf(
      openTransfers(space),
      'anki',
      writeOutside('disparador.apkg', ankiPackage(deck)),
    );
    expect(preview.counts.cards.fresh).toBe(3);
    expect(readdirSync(outside)).toEqual([]);
  });

  it('[CA-122] un medio con un nombre que sale de la carpeta no escribe fuera de ella', async () => {
    const space = openSpace({ withCast: true });
    const outside = outsideFolder();
    const deck = demoDeck({ format: 'legacy2' });
    deck.media = [{ name: '../../escapado.png', data: Buffer.from('x') }];
    const file = writeOutside('medio-trampa.apkg', ankiPackage(deck));
    await previewOf(openTransfers(space), 'anki', file);
    expect(everything(space.dataDir).some((path) => path.endsWith('escapado.png'))).toBe(false);
    expect(readdirSync(outside)).toEqual([]);
    expect(readdirSync(dirname(dirname(file))).some((entry) => entry === 'escapado.png')).toBe(
      false,
    );
  });

  it('[CA-122] un campo gigante se rechaza con su motivo y lo demás entra', async () => {
    const space = openSpace({ withCast: true });
    const deck = demoDeck();
    deck.notes.push({
      id: 9,
      guid: 'gigante',
      notetype: 'basic',
      fields: ['¿Gigante?', 'x'.repeat(300_000)],
      tags: [],
      cards: [{ ord: 0, id: 9, reviews: [] }],
    });
    const preview = await previewOf(
      openTransfers(space),
      'anki',
      writeOutside('gigante.apkg', ankiPackage(deck)),
    );
    expect(preview.counts.cards.fresh).toBe(3);
    expect(preview.rejected).toEqual([{ what: '¿Gigante?', reason: 'tooLarge' }]);
  });

  it('[CA-122] el HTML de un campo es dato: un script queda afuera y nada se ejecuta', async () => {
    const space = openSpace({ withCast: true });
    const deck = demoDeck();
    const first = deck.notes[0];
    if (first) {
      first.fields[1] =
        '<script>globalThis.retenia = "hackeado"</script>José de San Martín<img src=x onerror="globalThis.retenia=1">';
    }
    const transfers = openTransfers(space);
    const preview = await previewOf(
      transfers,
      'anki',
      writeOutside('script.apkg', ankiPackage(deck)),
    );
    expect((globalThis as { retenia?: unknown }).retenia).toBeUndefined();
    expect(preview.rejected).toEqual([
      { what: '¿Quién encabezó el cruce de los Andes en 1817?: x', reason: 'missingImage' },
    ]);
  });
});
