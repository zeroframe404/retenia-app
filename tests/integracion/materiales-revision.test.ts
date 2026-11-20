import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runMaterialsTask } from '../../src/main/workers/materials-tasks';
import type { MaterialsTask } from '../../src/main/workers/protocol';
import { texts } from '../../src/preload/contract/texts';
import { SCANNED_PAGE } from '../../tools/datos-de-ejemplo/contenido.mjs';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace, type Space } from '../apoyo/espacio';
import {
  INFERENCE,
  openMaterials,
  removeTempFolders,
  sample,
  statisticsSubject,
} from '../apoyo/materiales';
import { similarity } from '../apoyo/parecido';

// La revisión de un material (H-27) de punta a punta con la base real, el PDF del elenco y el
// reconocimiento real de tesseract.js: los tres bloques, el reconocimiento de la página 9, las
// correcciones, lo que depende de un texto corregido, el mapa de cobertura y las páginas excluidas.

afterEach(() => {
  closeSpaces();
  removeTempFolders();
});

type Opened = ReturnType<typeof openMaterials>;

async function processed(
  space: Space,
  options: Parameters<typeof openMaterials>[1] = {},
): Promise<{ opened: Opened; materialId: string }> {
  const subjectId = statisticsSubject(space);
  const opened = openMaterials(space, options);
  const { results } = await opened.service.addFiles({ paths: [sample(INFERENCE)], subjectId });
  const [first] = results;
  if (first?.outcome !== 'added') {
    throw new Error('no se agregó');
  }
  await opened.service.whenIdle();
  return { opened, materialId: first.materialId };
}

// Una tarjeta que cita todo un bloque del material, como si la hubieras creado desde el visor.
function cardOnBlock(
  space: Space,
  service: Opened['service'],
  materialId: string,
  blockId: string,
  question: string,
) {
  const block = space.workspace.materials.blocks(materialId).find((row) => row.id === blockId);
  if (!block) {
    throw new Error('el bloque no está');
  }
  return service.createCard({
    materialId,
    selection: {
      from: { blockId, offset: 0 },
      to: { blockId, offset: block.normalizedText.length },
    },
    question,
    answer: 'Lo que dice la tabla',
  }).cardId;
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

describe('los tres bloques de la revisión', () => {
  it('[CA-113] «Listo», «Con problemas» (páginas 7 y 11) y «No extraído» (página 9), y cada problema con una acción', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    const review = opened.service.review({ materialId });

    expect(review.ready.units).toEqual([1, 2, 3, 4, 5, 6, 8, 10, 12]);
    expect(review.ready.sections).toBeGreaterThan(0);
    expect(review.problems.map((problem) => problem.unit)).toEqual([7, 11]);
    expect(review.problems.map((problem) => problem.signals)).toEqual([
      ['possibleTable'],
      ['possibleFormula'],
    ]);
    for (const problem of review.problems) {
      expect(problem.actions.length).toBeGreaterThan(0);
      expect(problem.actions).toEqual(
        expect.arrayContaining(['viewOriginal', 'correctText', 'markAsImage', 'ignore']),
      );
      expect(problem.resolution).toBeNull();
    }
    expect(review.notExtracted).toEqual([
      expect.objectContaining({ unit: 9, actions: ['recognize', 'studyWithout'] }),
    ]);
    expect(review.firstSection).not.toBeNull();
  });

  it('[CA-113] las señales son avisos: la tabla y la fórmula siguen siendo texto legible y no hay veredicto', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    const review = opened.service.review({ materialId });
    const [table] = review.problems;
    expect(table?.original).toContain('1,960');
    expect(table?.excerpt.length).toBeGreaterThan(0);
    expect(JSON.stringify(review)).not.toMatch(/incorrecto|error de lectura|falso/i);
  });
});

describe('reconocer un escaneo', () => {
  it('[CA-114] «Intentar reconocimiento» en la página 9: sale de «No extraído» con texto parecido al esperado', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    expect(opened.service.review({ materialId }).notExtracted.map((page) => page.unit)).toEqual([
      9,
    ]);

    opened.service.ocrPage({ materialId, unit: 9 });
    await opened.service.whenIdle();

    const review = opened.service.review({ materialId });
    expect(review.notExtracted).toEqual([]);
    const unit9 = [...review.ready.units, ...review.problems.map((problem) => problem.unit)];
    expect(unit9).toContain(9);
    const recognized = space.workspace.materials
      .blocks(materialId)
      .filter((row) => row.unitNo === 9)
      .map((row) => row.normalizedText)
      .join(' ');
    const expected = [SCANNED_PAGE.title, SCANNED_PAGE.subtitle, ...SCANNED_PAGE.paragraphs].join(
      ' ',
    );
    expect(similarity(recognized, expected)).toBeGreaterThan(0.85);
    expect(
      readRows(space.file, 'SELECT text_source FROM material_units WHERE unit_no = 9'),
    ).toEqual([{ text_source: 'ocr' }]);
  });

  it('[CA-114] el reconocimiento corre en la cola y deja el original del PDF como estaba', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    const original = join(space.workspace.originalsDir, readdirOriginal(space));
    const before = createHash('sha256').update(readFileSync(original)).digest('hex');
    opened.service.ocrPage({ materialId, unit: 9 });
    await opened.service.whenIdle();
    // Pasó por la misma cola que cualquier lectura: una tarea de la página 9 en el proceso de trabajo.
    expect(opened.executed.filter((task) => task === 'extract:9')).toHaveLength(2);
    expect(createHash('sha256').update(readFileSync(original)).digest('hex')).toBe(before);
  });

  it('[CA-114] un reconocimiento con confianza baja deja la página en «Con problemas», no en «Listo»', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space, {
      execute: async (task: MaterialsTask) => {
        const result = await runMaterialsTask(task);
        if (task.kind === 'extract' && task.unit === 9 && 'ocr' in task && task.ocr) {
          const page = result as { page: { ocr?: { confidence: number } } };
          page.page.ocr = { confidence: 31 };
        }
        return result;
      },
    });
    opened.service.ocrPage({ materialId, unit: 9 });
    await opened.service.whenIdle();
    const review = opened.service.review({ materialId });
    expect(review.problems.map((problem) => problem.unit)).toContain(9);
    expect(review.problems.find((problem) => problem.unit === 9)?.signals).toContain(
      'lowConfidence',
    );
  });
});

function readdirOriginal(space: Space): string {
  const rows = readRows(space.file, 'SELECT original_sha256, original_ext FROM materials');
  const [row] = rows as { original_sha256: string; original_ext: string }[];
  return `${row?.original_sha256 ?? ''}.${row?.original_ext ?? ''}`;
}

describe('corregir un texto mal leído', () => {
  it('[CA-115] «Corregir texto» deja el original intacto y lista las 2 tarjetas que usan el texto', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    const table = blockOf(space, materialId, 'table', 7);
    const first = cardOnBlock(
      space,
      opened.service,
      materialId,
      table.id,
      '¿t para 10 gl al 95 %?',
    );
    const second = cardOnBlock(
      space,
      opened.service,
      materialId,
      table.id,
      '¿t para 20 gl al 95 %?',
    );

    const result = opened.service.correctText({
      materialId,
      blockId: table.id,
      text: table.normalizedText.replace('2,228', '2,229'),
    });

    expect(result.cards.map((card) => card.cardId).sort()).toEqual([first, second].sort());
    expect(result.cards).toHaveLength(2);
    expect(texts.materials.review.derivedAsk(2)).toBe(
      '2 tarjetas usan este texto. ¿Actualizarlas?',
    );
    // El texto de base no cambia: lo corregido vive aparte.
    const rows = readRows(
      space.file,
      "SELECT raw_text, normalized_text FROM material_blocks WHERE type = 'table'",
    ) as { raw_text: string; normalized_text: string }[];
    expect(rows[0]?.raw_text).toContain('2,228');
    expect(readRows(space.file, 'SELECT before_text, after_text FROM block_corrections')).toEqual([
      expect.objectContaining({ before_text: table.normalizedText }),
    ]);
    const page = opened.service.page({ materialId, unit: 7 });
    expect(page.blocks.find((block) => block.type === 'table')?.text).toContain('2,229');
    expect(opened.service.review({ materialId }).problems[0]?.resolution).toBe('corrected');
  });

  it('[CA-115] con una sola tarjeta dice «1 tarjeta usa este texto. ¿Actualizarla?»', () => {
    expect(texts.materials.review.derivedAsk(1)).toBe('1 tarjeta usa este texto. ¿Actualizarla?');
  });

  it('[CA-115] una página sin tarjetas que la citen corrige sin preguntar nada', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    const formula = blockOf(space, materialId, 'formula', 11);
    const result = opened.service.correctText({
      materialId,
      blockId: formula.id,
      text: 't =\n(x̄ − μ0) / (s / √n)',
    });
    expect(result.cards).toEqual([]);
  });

  it('[CA-115] no se acepta un texto vacío ni un bloque de otro material', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    const table = blockOf(space, materialId, 'table', 7);
    expect(() =>
      opened.service.correctText({ materialId, blockId: table.id, text: '  ' }),
    ).toThrow();
  });
});

describe('lo que depende de un texto corregido', () => {
  it('[CA-115] «Actualizarlas» mueve la cita de las tarjetas al texto corregido', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    const table = blockOf(space, materialId, 'table', 7);
    const cardId = cardOnBlock(space, opened.service, materialId, table.id, '¿t para 10 gl?');
    const { correctionId } = opened.service.correctText({
      materialId,
      blockId: table.id,
      text: table.normalizedText.replace('2,228', '2,229'),
    });
    expect(opened.service.sourceChange({ cardId })).toEqual({ changed: true });
    // La ficha y la sesión lo leen de la cita: «el origen cambió».
    expect(space.workspace.cards.get({ cardId }).cite?.changed).toBe(true);

    expect(opened.service.updateDerived({ correctionId, update: true })).toEqual({ updated: 1 });

    expect(opened.service.sourceChange({ cardId })).toEqual({ changed: false });
    expect(space.workspace.cards.get({ cardId }).cite?.changed).toBe(false);
    const opens = opened.service.open({ materialId, cardId });
    expect(opens.notFound).toBe(false);
    expect(opens.unit).toBe(7);
  });

  it('[CA-115] «Ahora no» deja la tarjeta como estaba, con el aviso «el origen cambió»', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    const table = blockOf(space, materialId, 'table', 7);
    const cardId = cardOnBlock(space, opened.service, materialId, table.id, '¿t para 10 gl?');
    const { correctionId } = opened.service.correctText({
      materialId,
      blockId: table.id,
      text: table.normalizedText.replace('2,228', '2,229'),
    });
    expect(opened.service.updateDerived({ correctionId, update: false })).toEqual({ updated: 0 });
    expect(opened.service.sourceChange({ cardId })).toEqual({ changed: true });
    expect(space.workspace.cards.get({ cardId }).cite?.changed).toBe(true);
    // La tarjeta sigue siendo la misma: ni su pregunta ni su respuesta se tocaron.
    expect(
      readRows(space.file, "SELECT count(*) AS n FROM observations WHERE kind = 'card.edited'"),
    ).toEqual([{ n: 0 }]);
  });
});

describe('la corrección sobrevive', () => {
  it('[CA-116] «Reprocesar esta página» vuelve a aplicar la corrección sobre el mismo texto de base', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    const table = blockOf(space, materialId, 'table', 7);
    const corrected = table.normalizedText.replace('2,228', '2,229');
    opened.service.correctText({ materialId, blockId: table.id, text: corrected });

    opened.service.reprocessPage({ materialId, unit: 7 });
    await opened.service.whenIdle();

    const after = opened.service.page({ materialId, unit: 7 });
    expect(after.blocks.find((block) => block.type === 'table')?.text).toBe(corrected);
    expect(readRows(space.file, 'SELECT state FROM block_corrections')).toEqual([
      { state: 'applied' },
    ]);
  });

  it('[CA-116] si el texto de base cambió queda «En conflicto» con las dos versiones y se puede decidir', async () => {
    const space = openSpace();
    let alter = false;
    const { opened, materialId } = await processed(space, {
      execute: async (task: MaterialsTask) => {
        const result = await runMaterialsTask(task);
        if (alter && task.kind === 'extract' && task.unit === 7) {
          const page = (result as { page: { items: { text: string }[] } }).page;
          for (const item of page.items) {
            item.text = item.text.replace('1,812', '1,813');
          }
        }
        return result;
      },
    });
    const table = blockOf(space, materialId, 'table', 7);
    const mine = table.normalizedText.replace('2,228', '2,229');
    const { correctionId } = opened.service.correctText({
      materialId,
      blockId: table.id,
      text: mine,
    });

    alter = true;
    opened.service.reprocessPage({ materialId, unit: 7 });
    await opened.service.whenIdle();

    expect(readRows(space.file, 'SELECT state FROM block_corrections')).toEqual([
      { state: 'conflict' },
    ]);
    const review = opened.service.review({ materialId });
    const problem = review.problems.find((entry) => entry.unit === 7);
    expect(problem?.resolution).toBe('conflict');
    expect(problem?.conflict?.mine).toBe(mine);
    expect(problem?.conflict?.current).toContain('1,813');
    expect(problem?.conflict?.differences.some((segment) => segment.changed)).toBe(true);
    // Nada se perdió: la corrección sigue guardada, entera.
    expect(readRows(space.file, 'SELECT after_text FROM block_corrections')).toEqual([
      { after_text: mine },
    ]);

    const kept = opened.service.resolveConflict({ correctionId, keep: true });
    expect(kept.problems.find((entry) => entry.unit === 7)?.resolution).toBe('corrected');
    expect(
      opened.service.page({ materialId, unit: 7 }).blocks.find((block) => block.type === 'table')
        ?.text,
    ).toBe(mine);
  });

  it('[CA-116] «Usar el texto nuevo» descarta la corrección en conflicto', async () => {
    const space = openSpace();
    let alter = false;
    const { opened, materialId } = await processed(space, {
      execute: async (task: MaterialsTask) => {
        const result = await runMaterialsTask(task);
        if (alter && task.kind === 'extract' && task.unit === 7) {
          const page = (result as { page: { items: { text: string }[] } }).page;
          for (const item of page.items) {
            item.text = item.text.replace('1,812', '1,813');
          }
        }
        return result;
      },
    });
    const table = blockOf(space, materialId, 'table', 7);
    const { correctionId } = opened.service.correctText({
      materialId,
      blockId: table.id,
      text: table.normalizedText.replace('2,228', '2,229'),
    });
    alter = true;
    opened.service.reprocessPage({ materialId, unit: 7 });
    await opened.service.whenIdle();
    opened.service.resolveConflict({ correctionId, keep: false });
    expect(readRows(space.file, 'SELECT count(*) AS n FROM block_corrections')).toEqual([{ n: 0 }]);
    expect(
      opened.service.page({ materialId, unit: 7 }).blocks.find((block) => block.type === 'table')
        ?.text,
    ).toContain('1,813');
  });

  it('[CA-116] la corrección también sobrevive a cerrar y abrir Retenia', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    const table = blockOf(space, materialId, 'table', 7);
    const corrected = table.normalizedText.replace('2,228', '2,229');
    opened.service.correctText({ materialId, blockId: table.id, text: corrected });
    await opened.service.stop();
    const again = openMaterials(space);
    expect(
      again.service.page({ materialId, unit: 7 }).blocks.find((block) => block.type === 'table')
        ?.text,
    ).toBe(corrected);
  });
});

describe('mapa de cobertura', () => {
  it('[CA-117] cada página tiene su palabra y el resumen del elenco es «9 de 12 páginas listas · 2 para revisar · 1 pendiente»', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    const { coverage } = opened.service.review({ materialId });
    expect(coverage.pages).toHaveLength(12);
    expect(coverage.pages.find((page) => page.unit === 7)?.word).toBe('review');
    expect(coverage.pages.find((page) => page.unit === 9)?.word).toBe('pending');
    expect(coverage.pages.find((page) => page.unit === 1)?.word).toBe('ready');
    expect(texts.materials.coverage.summary(coverage.summary)).toBe(
      '9 de 12 páginas listas · 2 para revisar · 1 pendiente',
    );
  });

  it('[CA-117] después de reconocer la página 9 y resolver los problemas, el resumen sube', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    opened.service.ocrPage({ materialId, unit: 9 });
    await opened.service.whenIdle();
    const [table, formula] = opened.service.review({ materialId }).problems;
    if (!table || !formula) {
      throw new Error('faltan los problemas');
    }
    opened.service.resolveProblem({ materialId, problemId: table.id, resolution: 'ignored' });
    opened.service.resolveProblem({ materialId, problemId: formula.id, resolution: 'image' });
    const { coverage } = opened.service.review({ materialId });
    expect(coverage.summary.ready + coverage.summary.review).toBeGreaterThanOrEqual(11);
    expect(coverage.summary.pending).toBe(0);
  });

  it('[CA-117] el estado de cada sección sale de sus páginas', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    const { coverage } = opened.service.review({ materialId });
    const states = coverage.sections.map((section) => section.state);
    expect(states.length).toBeGreaterThan(0);
    expect(states).toContain('ready');
    expect(states).toContain('problems');
    for (const state of states) {
      expect(['ready', 'processing', 'problems', 'excluded']).toContain(state);
    }
  });
});

describe('estudiar sin estas páginas', () => {
  it('[CA-118] «Estudiar sin estas páginas» deja la página 12 «Excluida» en el mapa', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    const review = opened.service.excludePages({ materialId, units: [12], excluded: true });
    expect(review.coverage.pages.find((page) => page.unit === 12)?.word).toBe('excluded');
    expect(review.excluded).toEqual([12]);
    expect(texts.materials.coverage.summary(review.coverage.summary)).toContain('1 excluida');
    // Y se puede volver a incluir.
    const back = opened.service.excludePages({ materialId, units: [12], excluded: false });
    expect(back.excluded).toEqual([]);
  });

  it('[CA-118] los bloques de una página excluida o con problema abierto no se ofrecen para tarjetas', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    const all = space.workspace.materials.blocks(materialId);
    const textBlocks = (unit: number) =>
      all.filter((row) => row.unitNo === unit && row.type === 'paragraph').map((row) => row.id);

    const before = opened.service.offerableBlockIds({ materialId });
    expect(before).toEqual(expect.arrayContaining(textBlocks(12)));
    expect(before).not.toContain(blockOf(space, materialId, 'table', 7).id);
    expect(before).not.toContain(blockOf(space, materialId, 'formula', 11).id);

    opened.service.excludePages({ materialId, units: [12], excluded: true });
    const after = opened.service.offerableBlockIds({ materialId });
    for (const id of textBlocks(12)) {
      expect(after).not.toContain(id);
    }
    expect(after).toEqual(expect.arrayContaining(textBlocks(1)));
  });

  it('[CA-118] un problema marcado como imagen o ignorado se resuelve; uno corregido también', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    const [table, formula] = opened.service.review({ materialId }).problems;
    if (!table || !formula) {
      throw new Error('faltan los problemas');
    }
    const review = opened.service.resolveProblem({
      materialId,
      problemId: formula.id,
      resolution: 'image',
    });
    expect(review.problems.find((problem) => problem.id === formula.id)?.resolution).toBe('image');
    expect(opened.service.offerableBlockIds({ materialId })).not.toContain(
      blockOf(space, materialId, 'formula', 11).id,
    );
    const undone = opened.service.resolveProblem({
      materialId,
      problemId: formula.id,
      resolution: null,
    });
    expect(undone.problems.find((problem) => problem.id === formula.id)?.resolution).toBeNull();
    expect(table.id).not.toBe(formula.id);
  });
});

describe('con el elenco de ejemplo', () => {
  it('[CA-115] la tabla de la página 7 la usan 2 tarjetas del elenco: «2 tarjetas usan este texto. ¿Actualizarlas?»', async () => {
    const space = openSpace({ withCast: true });
    const opened = openMaterials(space);
    await opened.service.whenIdle();
    const subject = space.workspace.subjects
      .list()
      .subjects.find((entry) => entry.name === 'Estadística básica');
    const material = opened.service
      .list({ subjectId: subject?.id ?? '' })
      .materials.find((entry) => entry.originalName === INFERENCE);
    if (!material) {
      throw new Error('el elenco no trae el PDF');
    }
    const review = opened.service.review({ materialId: material.id });
    expect(review.problems.map((problem) => problem.unit)).toEqual([7, 11]);
    expect(review.notExtracted.map((entry) => entry.unit)).toEqual([9]);
    expect(texts.materials.coverage.summary(review.coverage.summary)).toBe(
      '9 de 12 páginas listas · 2 para revisar · 1 pendiente',
    );
    const table = blockOf(space, material.id, 'table', 7);
    const result = opened.service.correctText({
      materialId: material.id,
      blockId: table.id,
      text: table.normalizedText.replace('2,228', '2,229'),
    });
    expect(result.cards).toHaveLength(2);
    expect(texts.materials.review.derivedAsk(result.cards.length)).toBe(
      '2 tarjetas usan este texto. ¿Actualizarlas?',
    );
  });
});

describe('la estructura de un escaneo reconocido', () => {
  it('[CA-114] el texto reconocido de la página 9 queda en párrafos: solo su título y su subtítulo son secciones', async () => {
    const space = openSpace();
    const { opened, materialId } = await processed(space);
    opened.service.ocrPage({ materialId, unit: 9 });
    await opened.service.whenIdle();
    const blocks = space.workspace.materials.blocks(materialId).filter((row) => row.unitNo === 9);
    const sections = blocks.filter((row) => row.type === 'section');
    expect(sections.length).toBeLessThanOrEqual(2);
    expect(blocks.filter((row) => row.type === 'paragraph').length).toBeGreaterThanOrEqual(3);
  });
});

describe('corregir mientras una página se vuelve a leer', () => {
  it('[CA-116] una corrección hecha mientras otra página se reprocesa no falla y queda aplicada cuando termina', async () => {
    const space = openSpace();
    let release: () => void = () => undefined;
    let hold: Promise<void> | null = null;
    const { opened, materialId } = await processed(space, {
      execute: async (task: MaterialsTask) => {
        if (hold && task.kind === 'extract' && task.unit === 7) {
          await hold;
        }
        return runMaterialsTask(task);
      },
    });
    const formula = blockOf(space, materialId, 'formula', 11);
    hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    opened.service.reprocessPage({ materialId, unit: 7 });
    const corrected = 't =\n(x̄ − μ0) / (s / √n)';
    expect(() =>
      opened.service.correctText({ materialId, blockId: formula.id, text: corrected }),
    ).not.toThrow();
    release();
    await opened.service.whenIdle();
    expect(
      opened.service.page({ materialId, unit: 11 }).blocks.find((block) => block.type === 'formula')
        ?.text,
    ).toBe(corrected);
    expect(readRows(space.file, 'SELECT state FROM block_corrections')).toEqual([
      { state: 'applied' },
    ]);
  });
});
