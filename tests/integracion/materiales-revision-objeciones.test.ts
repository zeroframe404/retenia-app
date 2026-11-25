import { afterEach, describe, expect, it } from 'vitest';
import { runMaterialsTask } from '../../src/main/workers/materials-tasks';
import type { MaterialsTask } from '../../src/main/workers/protocol';
import { readRows, runRaw } from '../apoyo/base-cruda';
import { closeSpaces, openSpace, type Space } from '../apoyo/espacio';
import {
  openMaterials,
  readInference,
  readInferenceFolder,
  removeTempFolders,
  statisticsSubject,
} from '../apoyo/materiales';

// Lo que encontró la revisión independiente de la Fase 14 (con la base real y el PDF del elenco):
// bloques con el mismo texto, corregir dos veces con tarjetas, deshacer, páginas sin texto,
// corregir mientras se vuelve a leer, tablas que no son de un PDF y las diferencias a la vista.

afterEach(() => {
  closeSpaces();
  removeTempFolders();
});

type Opened = ReturnType<typeof openMaterials>;

// La carpeta con el PDF de inferencia ya agregado y leído: una copia del que se leyó una vez
// (readInferenceFolder), lo mismo que dejaba agregarlo y esperar en cada prueba.
async function readSpace(): Promise<Space> {
  return openSpace({ copyOf: await readInferenceFolder() });
}

async function processed(space: Space, options: Parameters<typeof openMaterials>[1] = {}) {
  const opened = openMaterials(space, options);
  await opened.service.whenIdle();
  return { opened, materialId: readInference(space) };
}

const blockOf = (space: Space, materialId: string, type: string, unit: number) => {
  const found = space.workspace.materials
    .blocks(materialId)
    .find((row) => row.type === type && row.unitNo === unit);
  if (!found) {
    throw new Error(`no hay un bloque ${type} en la página ${String(unit)}`);
  }
  return found;
};

function cardOn(
  space: Space,
  service: Opened['service'],
  materialId: string,
  blockId: string,
  question: string,
  range?: [number, number],
) {
  const block = space.workspace.materials.blocks(materialId).find((row) => row.id === blockId);
  const [from, to] = range ?? [0, block?.normalizedText.length ?? 0];
  return service.createCard({
    materialId,
    selection: { from: { blockId, offset: from }, to: { blockId, offset: to } },
    question,
    answer: 'Lo que dice el material',
  }).cardId;
}

const STRANGE = 'Una muestra ��� de la población que se mide con cuidado.';

describe('dos bloques con el mismo texto en una página', () => {
  it('[CA-116] cada uno tiene su problema, ninguno se ofrece para tarjetas y la corrección va al bloque que se corrigió', async () => {
    const space = openSpace();
    const opened = openMaterials(space);
    const added = await opened.service.addText({
      subjectId: statisticsSubject(space),
      text: `Uno\n\n${STRANGE}\n\nDos\n\n${STRANGE}\n\nTres\n\nUn cierre sin problemas.`,
      title: 'Gemelos',
    });
    if (added.outcome !== 'added') {
      throw new Error('no se agregó');
    }
    const { materialId } = added;
    await opened.service.whenIdle();
    const twins = space.workspace.materials
      .blocks(materialId)
      .filter((row) => row.type === 'paragraph' && row.normalizedText.includes('�'));
    const [first, second] = twins;
    if (twins.length !== 2 || !first || !second) {
      throw new Error('faltan los gemelos');
    }
    const problems = opened.service.review({ materialId }).problems;
    expect(problems.map((problem) => problem.blockId).sort()).toEqual([first.id, second.id].sort());
    const offered = opened.service.offerableBlockIds({ materialId });
    expect(offered).not.toContain(first.id);
    expect(offered).not.toContain(second.id);

    const textOf = (id: string) =>
      space.workspace.materials.blocks(materialId).find((row) => row.id === id)?.normalizedText;
    opened.service.correctText({ materialId, blockId: second.id, text: 'Segundo corregido.' });
    expect(textOf(first.id)).toContain('�');
    expect(textOf(second.id)).toBe('Segundo corregido.');
    opened.service.correctText({ materialId, blockId: first.id, text: 'Primero corregido.' });
    expect(textOf(first.id)).toBe('Primero corregido.');
    expect(textOf(second.id)).toBe('Segundo corregido.');
    expect(readRows(space.file, 'SELECT count(*) AS n FROM block_corrections')).toEqual([{ n: 2 }]);
  });
});

describe('corregir dos veces el mismo bloque con tarjetas', () => {
  it('[CA-115] «Actualizarlas» después de cada corrección deja la cita en la fila que citaba', async () => {
    const space = await readSpace();
    const { opened, materialId } = await processed(space);
    const table = blockOf(space, materialId, 'table', 7);
    const row = '10\t1,812\t2,228\t3,169';
    const start = table.normalizedText.indexOf(row);
    const cardId = cardOn(space, opened.service, materialId, table.id, '¿t con 10 gl?', [
      start,
      start + row.length,
    ]);
    let current = table.normalizedText;
    for (const value of ['2,229', '2,230']) {
      current = current.replace(/2,2\d\d/, value);
      const blockId = blockOf(space, materialId, 'table', 7).id;
      const { correctionId } = opened.service.correctText({ materialId, blockId, text: current });
      expect(opened.service.updateDerived({ correctionId, update: true })).toEqual({ updated: 1 });
      const cite = JSON.parse(space.workspace.cards.sourceCite(cardId) as string) as {
        quote: string;
      };
      expect(cite.quote).toBe(`10\t1,812\t${value}\t3,169`);
    }
  });
});

describe('deshacer una corrección con tarjetas ya actualizadas', () => {
  it('[CA-115] «Deshacer» devuelve la cita de las tarjetas al texto de base: no quedan huérfanas', async () => {
    const space = await readSpace();
    const { opened, materialId } = await processed(space);
    const table = blockOf(space, materialId, 'table', 7);
    const cardId = cardOn(space, opened.service, materialId, table.id, '¿t con 10 gl?');
    const { correctionId } = opened.service.correctText({
      materialId,
      blockId: table.id,
      text: table.normalizedText.replace('2,228', '2,229'),
    });
    opened.service.updateDerived({ correctionId, update: true });
    const problem = opened.service.review({ materialId }).problems[0];
    opened.service.resolveProblem({ materialId, problemId: problem?.id ?? '', resolution: null });
    expect(space.workspace.cards.get({ cardId }).cite?.status).toBe('located');
    expect(opened.service.open({ materialId, cardId }).notFound).toBe(false);
  });
});

describe('páginas que no tienen texto no se ofrecen', () => {
  it('[CA-118] una página «No extraído» (casi sin texto) no aporta bloques para tarjetas', async () => {
    const space = await readSpace();
    const { opened, materialId } = await processed(space);
    const page3 = space.workspace.materials
      .blocks(materialId)
      .filter((row) => row.unitNo === 3 && row.type === 'paragraph')
      .map((row) => row.id);
    expect(opened.service.offerableBlockIds({ materialId })).toEqual(expect.arrayContaining(page3));
    runRaw(
      space.file,
      "UPDATE material_units SET status = 'no_text', char_count = 30 WHERE unit_no = 3",
    );
    const after = opened.service.offerableBlockIds({ materialId });
    for (const id of page3) {
      expect(after).not.toContain(id);
    }
    expect(opened.service.review({ materialId }).notExtracted.map((entry) => entry.unit)).toContain(
      3,
    );
  });
});

describe('una corrección hecha mientras se vuelve a leer, con tarjetas', () => {
  it('[CA-116] (simulado) «Actualizarlas» no se pierde: las tarjetas siguen pendientes hasta poder moverlas', async () => {
    const space = await readSpace();
    let release: () => void = () => undefined;
    let hold: Promise<void> | null = null;
    const { opened, materialId } = await processed(space, {
      execute: async (task: MaterialsTask) => {
        if (hold && task.kind === 'extract' && task.unit === 3) {
          await hold;
        }
        return runMaterialsTask(task);
      },
    });
    const table = blockOf(space, materialId, 'table', 7);
    const cardId = cardOn(space, opened.service, materialId, table.id, '¿t con 10 gl?');
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    opened.service.reprocessPage({ materialId, unit: 3 });
    const { correctionId } = opened.service.correctText({
      materialId,
      blockId: table.id,
      text: table.normalizedText.replace('2,228', '2,229'),
    });
    expect(opened.service.updateDerived({ correctionId, update: true })).toEqual({ updated: 0 });
    expect(opened.service.sourceChange({ cardId })).toEqual({ changed: true });
    release();
    await opened.service.whenIdle();
    expect(opened.service.updateDerived({ correctionId, update: true })).toEqual({ updated: 1 });
    expect(opened.service.sourceChange({ cardId })).toEqual({ changed: false });
  });
});

describe('señales de un material que no es un PDF', () => {
  it('[CA-113] una tabla de Markdown no es una lectura dudosa: no entra en «Con problemas»', async () => {
    const space = openSpace();
    const opened = openMaterials(space);
    const added = await opened.service.addText({
      subjectId: statisticsSubject(space),
      text: '# Notas\n\n| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n| 7 | 8 | 9 |\n',
      title: 'Notas con tabla',
    });
    if (added.outcome !== 'added') {
      throw new Error('no se agregó');
    }
    await opened.service.whenIdle();
    expect(opened.service.review({ materialId: added.materialId }).problems).toEqual([]);
  });
});

describe('lo corregido, con sus diferencias a la vista', () => {
  it('[CA-115] un problema corregido trae las diferencias de cifras, signos y unidades de los dos lados', async () => {
    const space = await readSpace();
    const { opened, materialId } = await processed(space);
    const table = blockOf(space, materialId, 'table', 7);
    opened.service.correctText({
      materialId,
      blockId: table.id,
      text: table.normalizedText.replace('2,228', '2,229').replace('90 %', '90'),
    });
    const problem = opened.service.review({ materialId }).problems[0];
    expect(problem?.cardsPending).toBe(0);
    const corrected = problem?.diff?.corrected
      .filter((segment) => segment.changed)
      .map((segment) => segment.text);
    const original = problem?.diff?.original
      .filter((segment) => segment.changed)
      .map((segment) => segment.text);
    expect(corrected).toContain('2,229');
    expect(original).toContain('2,228');
    expect(original?.join(' ')).toContain('%');
  });

  it('[CA-115] las tarjetas pendientes se pueden volver a preguntar desde el problema corregido', async () => {
    const space = await readSpace();
    const { opened, materialId } = await processed(space);
    const table = blockOf(space, materialId, 'table', 7);
    cardOn(space, opened.service, materialId, table.id, '¿t con 10 gl?');
    const { correctionId } = opened.service.correctText({
      materialId,
      blockId: table.id,
      text: table.normalizedText.replace('2,228', '2,229'),
    });
    opened.service.updateDerived({ correctionId, update: false });
    expect(opened.service.review({ materialId }).problems[0]?.cardsPending).toBe(1);
    opened.service.updateDerived({ correctionId, update: true });
    expect(opened.service.review({ materialId }).problems[0]?.cardsPending).toBe(0);
  });
});
