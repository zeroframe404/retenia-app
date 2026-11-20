import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { texts } from '../../src/preload/contract/texts';
import { ankiPackage, demoDeck } from '../../tools/datos-de-ejemplo/importaciones.mjs';
import { dumpTables, readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace, type Space } from '../apoyo/espacio';
import {
  openTransfers,
  previewOf,
  removeOutsideFolders,
  sample,
  writeOutside,
} from '../apoyo/importar';

// Importar de Anki (H-29) con la base real: la vista previa no escribe nada, «Importar» hace primero
// la copia «Antes de importar» y escribe todo en una sola transacción, los repasos entran con su
// fecha real y origen «importación», y el mismo archivo dos veces no duplica nada.

afterEach(() => {
  closeSpaces();
  removeOutsideFolders();
});

const historySubject = (space: Space) => {
  const found = space.workspace.subjects
    .list()
    .subjects.find((s) => s.name === 'Historia argentina');
  if (!found) {
    throw new Error('falta Historia argentina en el elenco');
  }
  return found.id;
};

// Lo que no cuenta como «escribir»: nada. Se comparan todas las tablas.
const everythingIn = (space: Space) => dumpTables(space.file);

describe('mazo-demo.apkg', () => {
  it('[CA-122] la vista previa dice «Entran 3 tarjetas y 5 repasos · Rechazadas: 0» y no escribe nada', async () => {
    const space = openSpace({ withCast: true });
    const before = everythingIn(space);
    const preview = await previewOf(openTransfers(space), 'anki', sample('mazo-demo.apkg'));
    expect(texts.imports.ankiSummary(preview.counts)).toBe(
      'Entran 3 tarjetas y 5 repasos · Rechazadas: 0',
    );
    expect(preview.rejected).toEqual([]);
    expect(preview.counts.cards.existing).toBe(0);
    expect(everythingIn(space)).toEqual(before);
  });

  it('[CA-122] al importar, las 3 tarjetas quedan en la materia elegida con su historial y su próximo repaso', async () => {
    const space = openSpace({ withCast: true });
    const transfers = openTransfers(space);
    const subjectId = historySubject(space);
    const cardsBefore = space.workspace.cards.list({ subjectId }).length;
    const preview = await previewOf(transfers, 'anki', sample('mazo-demo.apkg'));
    const result = await transfers.run({
      previewId: preview.previewId,
      destination: { kind: 'subject', subjectId },
    });
    expect(result.subjectId).toBe(subjectId);
    const imported = space.workspace.cards
      .list({ subjectId })
      .filter(
        (card) =>
          [
            '¿Quién encabezó el cruce de los Andes en 1817?',
            '¿Qué creó Manuel Belgrano en 1812?',
          ].some((question) => card.question.startsWith(question)) ||
          card.question.startsWith('La Independencia se declaró en'),
      );
    expect(space.workspace.cards.list({ subjectId })).toHaveLength(cardsBefore + 3);
    expect(imported).toHaveLength(3);
    for (const card of imported) {
      expect(card.nextReviewDay).not.toBeNull();
      expect(card.topicName).toBe('Independencia');
    }
    const andes = imported.find((card) => card.question.startsWith('¿Quién encabezó'));
    if (!andes) {
      throw new Error('falta la tarjeta de los Andes');
    }
    const history = space.workspace.cards.history({ cardId: andes.id });
    expect(history.entries.map((entry) => [entry.day, entry.result, entry.origin])).toEqual([
      ['2027-02-02', 'good', 'anki'],
      ['2027-02-06', 'good', 'anki'],
    ]);
    const reviews = readRows(
      space.file,
      "SELECT occurred_at, source FROM observations WHERE source = 'import:anki' AND kind = 'review.graded' ORDER BY occurred_at",
    );
    expect(reviews).toHaveLength(5);
    expect(reviews[0]).toEqual({ occurred_at: '2027-02-02T13:00:00.000Z', source: 'import:anki' });
    expect(space.workspace.verifyData()).toEqual([]);
  });

  it('[CA-122] la imagen del mazo queda guardada y la tarjeta la muestra', async () => {
    const space = openSpace({ withCast: true });
    const transfers = openTransfers(space);
    const preview = await previewOf(transfers, 'anki', sample('mazo-demo.apkg'));
    await transfers.run({
      previewId: preview.previewId,
      destination: { kind: 'subject', subjectId: historySubject(space) },
    });
    const [row] = readRows(
      space.file,
      "SELECT question_content FROM card_versions WHERE question LIKE '¿Qué creó Manuel Belgrano%'",
    );
    const content = JSON.parse(String(row?.question_content)) as { type: string; sha?: string }[];
    const image = content.find((node) => node.type === 'image');
    expect(image?.sha).toMatch(/^[0-9a-f]{64}$/);
    expect(
      readRows(space.file, 'SELECT sha256 FROM images WHERE sha256 = ?', image?.sha),
    ).toHaveLength(1);
  });

  it('[CA-126] «Importar» hace primero la copia «Antes de importar», con la base de antes', async () => {
    const space = openSpace({ withCast: true });
    const transfers = openTransfers(space);
    const cardsBefore = space.workspace.cards.count();
    const preview = await previewOf(transfers, 'anki', sample('mazo-demo.apkg'));
    const result = await transfers.run({
      previewId: preview.previewId,
      destination: { kind: 'subject', subjectId: historySubject(space) },
    });
    const backups = await space.workspace.backups();
    const copy = backups.find((backup) => backup.readable && backup.id === result.backupId);
    expect(copy?.readable && copy.kind).toBe('before_import');
    expect(copy?.readable && copy.counts.cards).toBe(cardsBefore);
    expect(texts.data.kinds.before_import).toBe('Antes de importar');
  });

  it('[CA-126] lo importado puede ir a una materia nueva', async () => {
    const space = openSpace({ withCast: true });
    const transfers = openTransfers(space);
    const preview = await previewOf(transfers, 'anki', sample('mazo-demo.apkg'));
    const result = await transfers.run({
      previewId: preview.previewId,
      destination: { kind: 'new', name: 'Prueba de migración' },
    });
    const created = space.workspace.subjects.list().subjects.find((s) => s.id === result.subjectId);
    expect(created?.name).toBe('Prueba de migración');
    expect(space.workspace.cards.list({ subjectId: result.subjectId })).toHaveLength(3);
  });

  it('[CA-126] si algo falla a mitad, no queda nada a medias', async () => {
    const space = openSpace({ withCast: true });
    const transfers = openTransfers(space);
    const preview = await previewOf(transfers, 'anki', sample('mazo-demo.apkg'));
    const before = everythingIn(space);
    // (simulado) La tercera tarjeta no se puede escribir.
    space.workspace.close();
    let inserted = 0;
    const failing = space.reopenWith({
      onStatement: (statement) => {
        if (/^insert into "cards"/i.test(statement)) {
          inserted += 1;
          if (inserted === 3) {
            throw new Error('(simulado) el disco se llenó');
          }
        }
      },
    });
    const again = openTransfers({ ...space, workspace: failing });
    const second = await previewOf(again, 'anki', sample('mazo-demo.apkg'));
    await expect(
      again.run({
        previewId: second.previewId,
        destination: { kind: 'subject', subjectId: historySubject(space) },
      }),
    ).rejects.toThrow();
    expect(preview.counts.cards.fresh).toBe(3);
    expect(everythingIn(space)).toEqual(before);
  });
});

describe('dos veces el mismo mazo', () => {
  it('[CA-124] la segunda vista previa dice «0 nuevas · 3 ya estaban» y no se duplica nada', async () => {
    const space = openSpace({ withCast: true });
    const transfers = openTransfers(space);
    const subjectId = historySubject(space);
    const first = await previewOf(transfers, 'anki', sample('mazo-demo.apkg'));
    await transfers.run({
      previewId: first.previewId,
      destination: { kind: 'subject', subjectId },
    });
    const cards = space.workspace.cards.count();
    const second = await previewOf(transfers, 'anki', sample('mazo-demo.apkg'));
    expect(
      texts.imports.again({
        fresh: second.counts.cards.fresh,
        existing: second.counts.cards.existing,
      }),
    ).toBe('0 nuevas · 3 ya estaban');
    expect(second.importedBefore).not.toBeNull();
    await transfers.run({
      previewId: second.previewId,
      destination: { kind: 'subject', subjectId },
    });
    expect(space.workspace.cards.count()).toBe(cards);
    expect(
      readRows(
        space.file,
        "SELECT count(*) AS n FROM observations WHERE source = 'import:anki'",
      )[0],
    ).toEqual({ n: 5 });
  });

  it('[CA-124] la huella es de cada nota: otra exportación del mismo mazo con una nota nueva trae solo esa', async () => {
    const space = openSpace({ withCast: true });
    const transfers = openTransfers(space);
    const subjectId = historySubject(space);
    const first = await previewOf(transfers, 'anki', sample('mazo-demo.apkg'));
    await transfers.run({
      previewId: first.previewId,
      destination: { kind: 'subject', subjectId },
    });
    const deck = demoDeck();
    deck.notes.push({
      id: 1_767_312_000_004,
      guid: 'Rt3n1a-guemes',
      notetype: 'basic',
      fields: ['¿Quién defendió la frontera norte?', 'Güemes'],
      tags: [],
      cards: [{ ord: 0, id: 1_767_312_000_104, reviews: [] }],
    });
    const file = writeOutside('mazo-nuevo.apkg', ankiPackage(deck));
    const second = await previewOf(transfers, 'anki', file);
    expect(second.counts.cards).toEqual({ fresh: 1, existing: 3 });
    expect(second.importedBefore).toBeNull();
  });
});

describe('los formatos de Anki', () => {
  for (const format of ['latest', 'legacy2', 'legacy1'] as const) {
    it(`[CA-122] lee el formato ${format}`, async () => {
      const space = openSpace({ withCast: true });
      const file = writeOutside(`mazo-${format}.apkg`, ankiPackage(demoDeck({ format })));
      const preview = await previewOf(openTransfers(space), 'anki', file);
      expect(texts.imports.ankiSummary(preview.counts)).toBe(
        'Entran 3 tarjetas y 5 repasos · Rechazadas: 0',
      );
    });
  }

  it('[CA-122] la colección de relleno del formato actual («actualizá Anki») no se lee', async () => {
    const space = openSpace({ withCast: true });
    const preview = await previewOf(openTransfers(space), 'anki', sample('mazo-demo.apkg'));
    expect(preview.counts.cards.fresh).toBe(3);
  });

  it('[CA-122] una colección entera (.colpkg) se lee igual', async () => {
    const space = openSpace({ withCast: true });
    const file = writeOutside('coleccion.colpkg', readFileSync(sample('mazo-demo.apkg')));
    const preview = await previewOf(openTransfers(space), 'anki', file);
    expect(preview.counts.cards.fresh).toBe(3);
  });

  it('[CA-122] un paquete de una versión de Anki más nueva se rechaza entero con su motivo', async () => {
    const space = openSpace({ withCast: true });
    const file = writeOutside('futuro.apkg', ankiPackage(demoDeck({ meta: 9 })));
    expect(await openTransfers(space).preview({ kind: 'anki', path: file })).toEqual({
      outcome: 'problem',
      problem: 'tooNew',
    });
  });

  it('[CA-122] sin la programación, las tarjetas entran «Disponibles» y la vista previa lo dice', async () => {
    const space = openSpace({ withCast: true });
    const deck = demoDeck();
    for (const note of deck.notes) {
      for (const card of note.cards) {
        card.reviews = [];
      }
    }
    const transfers = openTransfers(space);
    const preview = await previewOf(
      transfers,
      'anki',
      writeOutside('sin-historial.apkg', ankiPackage(deck)),
    );
    expect(preview.counts.withoutHistory).toBe(3);
    // En la materia activa: la propuesta de Estudiar no cambia hasta «Sumar a mis repasos».
    const subjectId = space.workspace.subjects
      .list()
      .subjects.find((subject) => subject.status === 'active')?.id;
    if (!subjectId) {
      throw new Error('falta la materia activa');
    }
    const proposalBefore = space.workspace.study.overview();
    await transfers.run({
      previewId: preview.previewId,
      destination: { kind: 'subject', subjectId },
    });
    const available = space.workspace.cards.list({ subjectId }).filter((card) => card.available);
    expect(available).toHaveLength(3);
    expect(
      readRows(space.file, 'SELECT count(*) AS n FROM cards WHERE available_only = 1')[0],
    ).toEqual({ n: 3 });
    expect(space.workspace.study.overview()).toEqual(proposalBefore);
    space.workspace.cards.activate({
      batchId: '0195f000-0000-7000-8000-000000000001',
      cardIds: available.map((card) => card.id),
    });
    expect(space.workspace.cards.list({ subjectId }).filter((card) => card.available)).toHaveLength(
      0,
    );
  });

  it('[CA-122] una imagen que no vino en el mazo se rechaza con su motivo y la tarjeta entra igual', async () => {
    const space = openSpace({ withCast: true });
    const file = writeOutside('sin-imagen.apkg', ankiPackage(demoDeck({ media: [] })));
    const preview = await previewOf(openTransfers(space), 'anki', file);
    expect(preview.counts.cards.fresh).toBe(3);
    expect(preview.rejected).toEqual([
      { what: '¿Qué creó Manuel Belgrano en 1812?: bandera.png', reason: 'missingImage' },
    ]);
    expect(texts.imports.ankiSummary(preview.counts)).toBe(
      'Entran 3 tarjetas y 5 repasos · Rechazadas: 1',
    );
  });

  it('[CA-122] el audio se guarda con la tarjeta y la tarjeta lo nombra', async () => {
    const space = openSpace({ withCast: true });
    const deck = demoDeck();
    const first = deck.notes[0];
    if (first) {
      first.fields[1] = 'José de San Martín [sound:san-martin.mp3]';
    }
    deck.media.push({ name: 'san-martin.mp3', data: Buffer.from('ID3 audio de prueba') });
    const transfers = openTransfers(space);
    const preview = await previewOf(
      transfers,
      'anki',
      writeOutside('audio.apkg', ankiPackage(deck)),
    );
    await transfers.run({
      previewId: preview.previewId,
      destination: { kind: 'subject', subjectId: historySubject(space) },
    });
    expect(readRows(space.file, 'SELECT name FROM attachments')).toEqual([
      { name: 'san-martin.mp3' },
    ]);
    const [answer] = readRows(
      space.file,
      "SELECT answer FROM card_versions WHERE answer LIKE 'José de San Martín%'",
    );
    expect(answer?.answer).toBe('José de San Martín\nAudio: san-martin.mp3');
  });
});
