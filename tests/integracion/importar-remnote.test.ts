import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { texts } from '../../src/preload/contract/texts';
import { demoRemnoteFiles } from '../../tools/datos-de-ejemplo/importaciones.mjs';
import { zip } from '../../tools/datos-de-ejemplo/zip.mjs';
import { dumpTables, readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace, type Space } from '../apoyo/espacio';
import {
  openTransfers,
  outsideFolder,
  previewOf,
  removeOutsideFolders,
  sample,
  writeOutside,
} from '../apoyo/importar';

// Importar de RemNote (H-29): la exportación en Markdown (un comprimido o una carpeta). Cada
// documento es una nota, los renglones conservan su jerarquía, las tarjetas «>>», «::» y huecos se
// reconocen, y como RemNote no exporta repasos sus tarjetas entran «Disponibles».

afterEach(() => {
  closeSpaces();
  removeOutsideFolders();
});

const historySubject = (space: Space) => {
  const found = space.workspace.subjects
    .list()
    .subjects.find((subject) => subject.name === 'Historia argentina');
  if (!found) {
    throw new Error('falta Historia argentina en el elenco');
  }
  return found.id;
};

const noteTitled = (space: Space, title: string) => {
  const [row] = readRows(space.file, 'SELECT id FROM notes WHERE title = ?', title);
  if (!row) {
    throw new Error(`falta la nota «${title}»`);
  }
  return space.workspace.notes.get({ noteId: String(row.id) });
};

describe('remnote-demo.zip', () => {
  it('[CA-123] la vista previa dice «12 notas, 8 tarjetas, 1 rechazada (imagen faltante)» y nada se escribe', async () => {
    const space = openSpace({ withCast: true });
    const before = dumpTables(space.file);
    const preview = await previewOf(openTransfers(space), 'remnote', sample('remnote-demo.zip'));
    expect(texts.imports.remnoteSummary(preview.counts, preview.rejected)).toBe(
      '12 notas, 8 tarjetas, 1 rechazada (imagen faltante)',
    );
    expect(preview.counts.withoutHistory).toBe(8);
    expect(dumpTables(space.file)).toEqual(before);
  });

  it('[CA-123] desde una carpeta da lo mismo que desde el comprimido', async () => {
    const space = openSpace({ withCast: true });
    const folder = join(outsideFolder(), 'Exportación de RemNote');
    for (const file of demoRemnoteFiles()) {
      mkdirSync(dirname(join(folder, file.name)), { recursive: true });
      writeFileSync(join(folder, file.name), file.data);
    }
    const preview = await previewOf(openTransfers(space), 'remnote', folder);
    expect(texts.imports.remnoteSummary(preview.counts, preview.rejected)).toBe(
      '12 notas, 8 tarjetas, 1 rechazada (imagen faltante)',
    );
  });

  it('[CA-125] al importar, la nota conserva sus renglones anidados y sus tarjetas, y la lista de rechazadas queda con su motivo', async () => {
    const space = openSpace({ withCast: true });
    const transfers = openTransfers(space);
    const subjectId = historySubject(space);
    const preview = await previewOf(transfers, 'remnote', sample('remnote-demo.zip'));
    const result = await transfers.run({
      previewId: preview.previewId,
      destination: { kind: 'subject', subjectId },
    });
    const note = noteTitled(space, 'Congreso de Tucumán');
    expect(note.subjectId).toBe(subjectId);
    const byText = (text: string) =>
      note.blocks.find((block) =>
        block.content.some((node) => node.type === 'text' && node.text.startsWith(text)),
      );
    const root = byText('El Congreso se reunió');
    const child = byText('Los diputados venían');
    const grandchild = byText('Algunas provincias');
    expect(root?.parentId).toBeNull();
    expect(child?.parentId).toBe(root?.id);
    expect(grandchild?.parentId).toBe(child?.id);
    expect(byText('¿En qué año se declaró la Independencia? >> 1816')?.parentId).toBe(root?.id);
    const cards = space.workspace.cards.list({ subjectId });
    expect(cards.filter((card) => card.available)).toHaveLength(8);
    const [record] = transfers.list().filter((item) => item.importId === result.importId);
    expect(record?.rejected).toEqual([
      { what: 'Cruce de los Andes: mapa-del-cruce.png', reason: 'missingImage' },
    ]);
    expect(texts.imports.reasons[record?.rejected[0]?.reason ?? 'missingImage']).toBe(
      'imagen faltante',
    );
  });

  it('[CA-125] «Guardar lista» arma la lista de rechazadas en texto, con su motivo', async () => {
    const space = openSpace({ withCast: true });
    const transfers = openTransfers(space);
    const preview = await previewOf(transfers, 'remnote', sample('remnote-demo.zip'));
    const { importId } = await transfers.run({
      previewId: preview.previewId,
      destination: { kind: 'subject', subjectId: historySubject(space) },
    });
    expect(transfers.rejectedList(importId)).toBe(
      [
        'Rechazadas de «remnote-demo.zip» (15/03/2027)',
        '',
        'Cruce de los Andes: mapa-del-cruce.png · imagen faltante',
        '',
      ].join('\r\n'),
    );
  });

  it('[CA-123] los temas salen de las carpetas: «Independencia» ya existía y se usa; «Revolución de Mayo» se crea', async () => {
    const space = openSpace({ withCast: true });
    const transfers = openTransfers(space);
    const subjectId = historySubject(space);
    const topicsBefore = readRows(
      space.file,
      'SELECT name FROM topics WHERE subject_id = ?',
      subjectId,
    );
    const preview = await previewOf(transfers, 'remnote', sample('remnote-demo.zip'));
    await transfers.run({
      previewId: preview.previewId,
      destination: { kind: 'subject', subjectId },
    });
    const names = readRows(
      space.file,
      'SELECT name FROM topics WHERE subject_id = ? ORDER BY name',
      subjectId,
    ).map((row) => row.name);
    expect(names).toEqual(['Independencia', 'Revolución de Mayo']);
    expect(topicsBefore.map((row) => row.name)).toEqual(['Independencia']);
  });

  it('[CA-123] el enlace entre documentos queda como enlace a la nota importada', async () => {
    const space = openSpace({ withCast: true });
    const transfers = openTransfers(space);
    const preview = await previewOf(transfers, 'remnote', sample('remnote-demo.zip'));
    await transfers.run({
      previewId: preview.previewId,
      destination: { kind: 'subject', subjectId: historySubject(space) },
    });
    const target = noteTitled(space, 'Congreso de Tucumán');
    const andes = noteTitled(space, 'Cruce de los Andes');
    const mention = andes.blocks
      .flatMap((block) => block.content)
      .find((node) => node.type === 'mention');
    expect(mention).toEqual({ type: 'mention', id: target.id, label: 'Congreso de Tucumán' });
  });

  it('[CA-124] la segunda vez dice «0 nuevas · 12 ya estaban» y no duplica nada', async () => {
    const space = openSpace({ withCast: true });
    const transfers = openTransfers(space);
    const subjectId = historySubject(space);
    const first = await previewOf(transfers, 'remnote', sample('remnote-demo.zip'));
    await transfers.run({
      previewId: first.previewId,
      destination: { kind: 'subject', subjectId },
    });
    const before = dumpTables(space.file, { except: [] });
    const second = await previewOf(transfers, 'remnote', sample('remnote-demo.zip'));
    expect(
      texts.imports.again({
        fresh: second.counts.notes.fresh,
        existing: second.counts.notes.existing,
      }),
    ).toBe('0 nuevas · 12 ya estaban');
    // Y tocar «Importar» igual no escribe nada: ni notas, ni tarjetas, ni otra importación.
    const notes = readRows(space.file, 'SELECT count(*) AS n FROM notes')[0];
    const cards = readRows(space.file, 'SELECT count(*) AS n FROM cards')[0];
    await transfers.run({
      previewId: second.previewId,
      destination: { kind: 'subject', subjectId },
    });
    expect(readRows(space.file, 'SELECT count(*) AS n FROM notes')[0]).toEqual(notes);
    expect(readRows(space.file, 'SELECT count(*) AS n FROM cards')[0]).toEqual(cards);
    expect(dumpTables(space.file, { except: ['imports'] })).toEqual(
      Object.fromEntries(Object.entries(before).filter(([table]) => table !== 'imports')),
    );
  });

  it('[CA-123] un documento que no es texto se rechaza con su motivo y los demás entran', async () => {
    const space = openSpace({ withCast: true });
    const files = [
      ...demoRemnoteFiles(),
      { name: 'Roto.md', data: Buffer.from([0xff, 0xfe, 0x00, 0xd8, 0x00, 0x00]) },
    ];
    const preview = await previewOf(
      openTransfers(space),
      'remnote',
      writeOutside('roto.zip', zip(files)),
    );
    expect(preview.counts.notes.fresh).toBe(12);
    expect(preview.rejected).toContainEqual({ what: 'Roto.md', reason: 'unreadableDocument' });
  });

  it('[CA-123] un comprimido sin documentos Markdown no es una exportación de RemNote', async () => {
    const space = openSpace({ withCast: true });
    const file = writeOutside(
      'vacio.zip',
      zip([{ name: 'foto.png', data: readFileSync(sample('campana.png')) }]),
    );
    expect(await openTransfers(space).preview({ kind: 'remnote', path: file })).toEqual({
      outcome: 'problem',
      problem: 'notRemnote',
    });
  });
});
