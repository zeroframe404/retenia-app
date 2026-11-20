import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { and, asc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import type { Clock } from '../core/clock';
import type { BlockType, Box } from '../core/materials/blocks';
import type { Transformation } from '../core/materials/normalize';
import {
  type FailureKind,
  failTask,
  pickNext,
  recoverTask,
  releaseTask,
  startTask,
  type TaskState,
  type TaskStatus,
} from '../core/materials/queue';
import { relocateQuote, unitTexts } from '../core/materials/relocate';
import type { MaterialKind } from '../core/materials/signature';
import { stageKeyInput } from '../core/materials/stage-key';
import {
  type ErrorProblem,
  materialState,
  type Stage,
  stageView,
  type UnitStatus,
} from '../core/materials/status';
import { localDateTime } from '../core/study-day';
import type { MaterialDetail, MaterialSummary } from '../preload/contract/materials';
import { texts } from '../preload/contract/texts';
import type { ReteniaDatabase } from './database';
import { newId } from './ids';
import type { Writer } from './orm';
import {
  blockCorrections,
  ingestResults,
  ingestTasks,
  materialBlocks,
  materials,
  materialUnits,
  problemResolutions,
} from './schema';

// Los materiales en la base (Fase 13): cada material con sus unidades (páginas), sus bloques, los
// resultados de cada etapa (que solo se agregan) y la cola de tareas. Las reglas (qué estado tiene
// un material, qué tarea sigue, qué pasa cuando una falla) son las de src/core/materials; acá se
// leen y se escriben, siempre en transacciones.

// La versión de la cadena propia de Retenia (lo que arma con lo que leen pdf.js y mammoth: cajas,
// bloques, estructura y normalización). Es parte de la clave de cada etapa: subirla cuando cambia
// ese código hace que cada etapa se vuelva a hacer en vez de reusar lo guardado.
export const PIPELINE_VERSION = 1;

const STAGE_ORDER: Record<Stage, number> = {
  validate: 0,
  extract: 1,
  structure: 2,
  normalize: 3,
  index: 4,
};

class MaterialNotFoundError extends Error {
  constructor() {
    super('No encontré el material');
    this.name = 'MaterialNotFoundError';
  }
}

export type MaterialRow = typeof materials.$inferSelect;
type TaskRowDb = typeof ingestTasks.$inferSelect;
export type UnitRow = typeof materialUnits.$inferSelect;
export type CorrectionRow = typeof blockCorrections.$inferSelect;
export type ResolutionRow = typeof problemResolutions.$inferSelect;
export type BlockRow = typeof materialBlocks.$inferSelect;

interface TaskRow {
  id: string;
  materialId: string;
  stage: Stage;
  unitNo: number;
  status: TaskStatus;
  attempts: number;
  recoveries: number;
  runnerId: string | null;
  heartbeatAt: number | null;
  resultKey: string | null;
}

export interface QueueItem extends TaskRow {
  addedAt: string;
  kind: MaterialKind;
  originalSha256: string;
  originalExt: string;
  unitCount: number | null;
}

// El localizador de un bloque: dónde está cada renglón en la hoja y en el texto normalizado.
export interface BlockLocator {
  kind: 'pdf' | 'flow';
  page: number;
  lines: { norm: [number, number]; box: Box | null }[];
  headingPath: string[];
  paragraphIndex: number;
}

// La cita que guarda la ficha de una tarjeta (card_versions.source_cite).
export interface StoredCite {
  materialId: string;
  originalSha256: string;
  materialVersion: number;
  pipelineVersion: number;
  locator: {
    kind: 'pdf' | 'flow';
    page: number;
    boxes: Box[];
    quote: string;
    before: string;
    after: string;
    paragraphIndex: number;
    headingPath: string[];
  };
  quote: string;
}

export interface IndexedBlock {
  id: string;
  parentId: string | null;
  type: BlockType;
  level: number;
  unit: number;
  raw: string;
  normalized: string;
  transformations: Transformation[];
  locator: BlockLocator;
  // El texto de base, si `normalized` es una corrección tuya (Fase 14).
  base?: string | null;
}

interface SavedResult {
  key: string;
  output: unknown;
}

interface StageMeta {
  tool: string;
  toolVersion: string;
  params: unknown;
}

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

function toTask(row: TaskRowDb): TaskRow {
  return {
    id: row.id,
    materialId: row.materialId,
    stage: row.stage as Stage,
    unitNo: row.unitNo,
    status: row.status as TaskStatus,
    attempts: row.attempts,
    recoveries: row.recoveries,
    runnerId: row.runnerId,
    heartbeatAt: row.heartbeatAt,
    resultKey: row.resultKey,
  };
}

const toState = (task: TaskRow): TaskState => ({
  id: task.id,
  status: task.status,
  attempts: task.attempts,
  recoveries: task.recoveries,
  runnerId: task.runnerId,
  heartbeatAt: task.heartbeatAt,
});

// La referencia legible de un pasaje: «Apunte de la clase · página 2» en un PDF;
// «notas · Dispersión» (la sección que lo contiene) en Word, Markdown y texto.
export function referenceOf(
  title: string,
  kind: 'pdf' | 'flow',
  page: number,
  headingPath: readonly string[],
): string {
  if (kind === 'pdf') {
    return texts.materials.pageReference(title, page);
  }
  const section = headingPath.at(-1);
  return section ? texts.materials.sectionReference(title, section) : title;
}

export interface MaterialsStore {
  count(): number;
  // Agrega un material ya recibido. Si no tiene error, también su primera tarea (validar).
  create(input: {
    subjectId: string;
    title: string;
    kind: MaterialKind | null;
    originalSha256: string | null;
    originalName: string;
    originalExt: string | null;
    sizeBytes: number;
    errorCode: ErrorProblem | null;
    previousMaterialId?: string | null;
    versionNo?: number;
    addedAt?: string;
    // Páginas web (Fase 14): la dirección, cuándo se sacó la instantánea y si espera conexión.
    sourceUrl?: string | null;
    snapshotAt?: string | null;
    pendingNetwork?: boolean;
  }): string;
  // Una página web pendiente ya se bajó: se guarda su original y empieza la cadena.
  attachDownload(
    materialId: string,
    input: { sha256: string; ext: string; sizeBytes: number; snapshotAt: string },
  ): void;
  // Un material que no pasó por la cadena y ya sabemos que no sirve (una página que pide pagar).
  failMaterial(materialId: string, problem: ErrorProblem): void;
  pendingWeb(): { id: string; sourceUrl: string }[];
  units(materialId: string): UnitRow[];
  // Volver a leer una página (reconocimiento o «Reprocesar»): la unidad vuelve a «pendiente» y la
  // cadena de después se repite.
  requestExtract(materialId: string, unit: number, ocr: boolean): void;
  setExcluded(materialId: string, units: readonly number[], excluded: boolean): void;
  // Vuelve a escribir los bloques (con las correcciones aplicadas) sin pasar por la cola.
  replaceBlocks(
    materialId: string,
    blocks: readonly IndexedBlock[],
    outcomes?: Readonly<Record<string, 'applied' | 'conflict'>>,
  ): void;
  setTitle(materialId: string, title: string): void;
  // La capa de correcciones y lo que se decidió de cada problema (Fase 14).
  corrections(materialId: string): CorrectionRow[];
  correction(correctionId: string): CorrectionRow | undefined;
  saveCorrection(input: {
    materialId: string;
    unit: number;
    key: string;
    before: string;
    after: string;
    pendingCards: readonly string[];
  }): string;
  dropCorrection(correctionId: string): void;
  keepCorrection(correctionId: string, input: { key: string; before: string }): void;
  setPendingCards(correctionId: string, cardIds: readonly string[]): void;
  cardsWithPendingChange(cardId: string): boolean;
  resolutions(materialId: string): ResolutionRow[];
  setResolution(
    materialId: string,
    unit: number,
    problemKey: string,
    resolution: 'image' | 'ignored' | null,
  ): void;
  findByHash(sha256: string): MaterialRow | undefined;
  findByName(subjectId: string, name: string): MaterialRow | undefined;
  row(materialId: string): MaterialRow;
  summaries(subjectId: string): MaterialSummary[];
  summary(materialId: string): MaterialSummary;
  detail(materialId: string): MaterialDetail;
  // La cola.
  next(): QueueItem | null;
  peek(): QueueItem | null;
  recover(runnerId: string, now: number): number;
  // Suelta la tarea en curso sin contar intento ni vuelta (la cola se pausa).
  release(taskId: string): void;
  start(taskId: string, runnerId: string, now: number): TaskRow | null;
  heartbeat(taskId: string, runnerId: string, now: number): void;
  task(taskId: string): TaskRow | undefined;
  result(key: string): unknown | undefined;
  resultKey(input: { originalSha256: string; unit: number; stage: Stage } & StageMeta): string;
  completeValidate(
    taskId: string,
    saved: SavedResult & StageMeta,
    units: { unit: number; width: number | null; height: number | null }[],
  ): void;
  completeExtract(
    taskId: string,
    saved: SavedResult & StageMeta,
    unit: {
      status: 'ready' | 'no_text';
      chars: number;
      paragraphs: number;
      textSource?: 'pdf' | 'ocr';
      ocrConfidence?: number | null;
    },
  ): void;
  completeStage(taskId: string, saved: SavedResult & StageMeta): void;
  completeIndex(
    taskId: string,
    blocks: readonly IndexedBlock[],
    outcomes?: Readonly<Record<string, 'applied' | 'conflict'>>,
  ): void;
  failValidation(taskId: string, problem: ErrorProblem): void;
  fail(taskId: string, kind: FailureKind, problem: string): TaskStatus;
  // Las salidas de las etapas anteriores de un material.
  stageOutputs(materialId: string, stage: Stage): { unit: number; key: string; output: unknown }[];
  cancel(materialId: string): void;
  resume(materialId: string): void;
  dismiss(materialId: string): void;
  blocks(materialId: string): BlockRow[];
  unit(materialId: string, unit: number): UnitRow | undefined;
  unitTexts(materialId: string): ReturnType<typeof unitTexts>;
}

export function createMaterialsStore(db: ReteniaDatabase, clock: Clock): MaterialsStore {
  const { orm } = db;

  const findRow = (tx: Writer, materialId: string) =>
    tx
      .select()
      .from(materials)
      .where(and(eq(materials.id, materialId), isNull(materials.deletedAt)))
      .get();

  const rowOf = (tx: Writer, materialId: string): MaterialRow => {
    const found = findRow(tx, materialId);
    if (!found) {
      throw new MaterialNotFoundError();
    }
    return found;
  };

  const tasksOf = (tx: Writer, materialId: string) =>
    tx
      .select()
      .from(ingestTasks)
      .where(eq(ingestTasks.materialId, materialId))
      .orderBy(asc(ingestTasks.stageOrder), asc(ingestTasks.unitNo))
      .all()
      .map(toTask);

  const unitsOf = (tx: Writer, materialId: string) =>
    tx
      .select()
      .from(materialUnits)
      .where(eq(materialUnits.materialId, materialId))
      .orderBy(asc(materialUnits.unitNo))
      .all();

  const summaryOf = (tx: Writer, row: MaterialRow): MaterialSummary => {
    const tasks = tasksOf(tx, row.id);
    const units = unitsOf(tx, row.id);
    const input = {
      errorCode: row.errorCode,
      pendingNetwork: row.pendingNetwork === 1,
      unitCount: row.unitCount,
      units: units.map((unit) => ({ status: unit.status as UnitStatus })),
      tasks: tasks.map((task) => ({ stage: task.stage, status: task.status })),
    };
    const kind = (row.kind ?? 'text') as MaterialKind;
    return {
      id: row.id,
      subjectId: row.subjectId,
      title: row.title,
      originalName: row.originalName,
      kind: row.kind as MaterialKind | null,
      sourceUrl: row.sourceUrl,
      snapshotDay: row.snapshotAt ? localDateTime(new Date(row.snapshotAt)).day : null,
      versionNo: row.versionNo,
      previousMaterialId: row.previousMaterialId,
      // El día del calendario en que lo agregaste (no el «día de estudio», que corta a las 04:00).
      addedDay: localDateTime(new Date(row.addedAt)).day,
      state: materialState(input),
      stages: stageView({
        kind,
        unitCount: row.unitCount,
        units: units.map((unit) => ({ status: unit.status as UnitStatus, chars: unit.charCount })),
        paragraphs: units.reduce((total, unit) => total + unit.paragraphCount, 0),
        tasks: input.tasks,
      }),
    };
  };

  const addTask = (tx: Writer, materialId: string, stage: Stage, unitNo: number) => {
    const now = clock.now().toISOString();
    tx.insert(ingestTasks)
      .values({
        id: newId(),
        materialId,
        stage,
        stageOrder: STAGE_ORDER[stage],
        unitNo,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  };

  const taskRow = (tx: Writer, taskId: string) => {
    const found = tx.select().from(ingestTasks).where(eq(ingestTasks.id, taskId)).get();
    return found ? toTask(found) : undefined;
  };

  const saveResult = (
    tx: Writer,
    task: TaskRow,
    material: MaterialRow,
    { key, output, tool, toolVersion, params }: SavedResult & StageMeta,
  ) => {
    const json = JSON.stringify(output);
    tx.insert(ingestResults)
      .values({
        key,
        originalSha256: material.originalSha256 ?? '',
        unitNo: task.unitNo,
        stage: task.stage,
        tool,
        toolVersion,
        params: JSON.stringify(params ?? null),
        output: gzipSync(Buffer.from(json, 'utf8')),
        outputSha256: sha256(json),
        createdAt: clock.now().toISOString(),
      })
      .onConflictDoNothing()
      .run();
  };

  const markDone = (tx: Writer, taskId: string, resultKey: string | null) => {
    tx.update(ingestTasks)
      .set({
        status: 'done',
        resultKey,
        runnerId: null,
        heartbeatAt: null,
        updatedAt: clock.now().toISOString(),
      })
      .where(eq(ingestTasks.id, taskId))
      .run();
  };

  const touch = (tx: Writer, materialId: string) => {
    tx.update(materials)
      .set({ updatedAt: clock.now().toISOString() })
      .where(eq(materials.id, materialId))
      .run();
  };

  // Cuando todas las páginas terminaron (bien o «Requiere revisión»), sigue la estructura, si hay
  // alguna página leída.
  const afterExtract = (tx: Writer, materialId: string) => {
    const tasks = tasksOf(tx, materialId);
    const extract = tasks.filter((task) => task.stage === 'extract');
    const pending = extract.some((task) =>
      ['pending', 'running', 'cancelled'].includes(task.status),
    );
    if (pending || tasks.some((task) => task.stage === 'structure')) {
      return;
    }
    const read = unitsOf(tx, materialId).some(
      (unit) => unit.status === 'ready' || unit.status === 'no_text',
    );
    if (read) {
      addTask(tx, materialId, 'structure', 0);
    }
  };

  const NEXT: Partial<Record<Stage, Stage>> = { structure: 'normalize', normalize: 'index' };

  // Escribe los bloques de un material (reemplaza los que había) y el estado de cada corrección.
  const writeBlocks = (
    tx: Writer,
    materialId: string,
    blocks: readonly IndexedBlock[],
    outcomes: Readonly<Record<string, 'applied' | 'conflict'>>,
  ) => {
    tx.delete(materialBlocks).where(eq(materialBlocks.materialId, materialId)).run();
    blocks.forEach((block, position) => {
      tx.insert(materialBlocks)
        .values({
          id: block.id,
          materialId,
          parentId: block.parentId,
          position,
          type: block.type,
          level: block.level,
          unitNo: block.unit,
          rawText: block.raw,
          normalizedText: block.normalized,
          transformations: JSON.stringify(block.transformations),
          locator: JSON.stringify(block.locator),
          baseText: block.base ?? null,
        })
        .run();
    });
    for (const [correctionId, state] of Object.entries(outcomes)) {
      tx.update(blockCorrections)
        .set({ state, updatedAt: clock.now().toISOString() })
        .where(eq(blockCorrections.id, correctionId))
        .run();
    }
  };

  const writeTask = (tx: Writer, task: TaskRow, state: TaskState) => {
    tx.update(ingestTasks)
      .set({
        status: state.status,
        attempts: state.attempts,
        recoveries: state.recoveries,
        runnerId: state.runnerId,
        heartbeatAt: state.heartbeatAt,
        updatedAt: clock.now().toISOString(),
      })
      .where(eq(ingestTasks.id, task.id))
      .run();
  };

  // Lo que pasa con el resto cuando una tarea queda «Requiere revisión».
  const afterReview = (tx: Writer, task: TaskRow) => {
    if (task.stage === 'extract') {
      tx.update(materialUnits)
        .set({ status: 'review' })
        .where(
          and(eq(materialUnits.materialId, task.materialId), eq(materialUnits.unitNo, task.unitNo)),
        )
        .run();
      afterExtract(tx, task.materialId);
    }
  };

  const queueItems = (tx: Writer): QueueItem[] =>
    tx
      .select({
        task: ingestTasks,
        addedAt: materials.addedAt,
        kind: materials.kind,
        originalSha256: materials.originalSha256,
        originalExt: materials.originalExt,
        unitCount: materials.unitCount,
      })
      .from(ingestTasks)
      .innerJoin(materials, eq(materials.id, ingestTasks.materialId))
      .where(
        and(
          eq(ingestTasks.status, 'pending'),
          isNull(materials.deletedAt),
          isNull(materials.errorCode),
        ),
      )
      .all()
      .map((row) => ({
        ...toTask(row.task),
        addedAt: row.addedAt,
        kind: (row.kind ?? 'text') as MaterialKind,
        originalSha256: row.originalSha256 ?? '',
        originalExt: row.originalExt ?? 'txt',
        unitCount: row.unitCount,
      }));

  const pick = (items: QueueItem[]) =>
    pickNext(
      items.map((item) => ({
        ...item,
        stage: STAGE_ORDER[item.stage],
        unit: item.unitNo,
        item,
      })),
    )?.item ?? null;

  return {
    count: () => orm.select({ n: sql<number>`count(*)` }).from(materials).get()?.n ?? 0,

    create(input) {
      const id = newId();
      const now = clock.now().toISOString();
      orm.transaction((tx) => {
        tx.insert(materials)
          .values({
            id,
            subjectId: input.subjectId,
            title: input.title,
            kind: input.kind,
            originalSha256: input.originalSha256,
            originalName: input.originalName,
            originalExt: input.originalExt,
            sizeBytes: input.sizeBytes,
            errorCode: input.errorCode,
            previousMaterialId: input.previousMaterialId ?? null,
            versionNo: input.versionNo ?? 1,
            pipelineVersion: PIPELINE_VERSION,
            addedAt: input.addedAt ?? now,
            updatedAt: now,
            sourceUrl: input.sourceUrl ?? null,
            snapshotAt: input.snapshotAt ?? null,
            pendingNetwork: input.pendingNetwork ? 1 : 0,
          })
          .run();
        if (input.errorCode === null && !input.pendingNetwork) {
          addTask(tx, id, 'validate', 0);
        }
      });
      return id;
    },

    attachDownload(materialId, { sha256: hash, ext, sizeBytes, snapshotAt }) {
      orm.transaction((tx) => {
        rowOf(tx, materialId);
        tx.update(materials)
          .set({
            originalSha256: hash,
            originalExt: ext,
            sizeBytes,
            snapshotAt,
            pendingNetwork: 0,
            updatedAt: clock.now().toISOString(),
          })
          .where(eq(materials.id, materialId))
          .run();
        addTask(tx, materialId, 'validate', 0);
      });
    },

    failMaterial(materialId, problem) {
      orm.transaction((tx) => {
        rowOf(tx, materialId);
        tx.update(materials)
          .set({ errorCode: problem, pendingNetwork: 0, updatedAt: clock.now().toISOString() })
          .where(eq(materials.id, materialId))
          .run();
      });
    },

    pendingWeb: () =>
      orm
        .select({ id: materials.id, sourceUrl: materials.sourceUrl })
        .from(materials)
        .where(
          and(
            eq(materials.pendingNetwork, 1),
            isNull(materials.deletedAt),
            isNull(materials.errorCode),
          ),
        )
        .orderBy(asc(materials.addedAt))
        .all()
        .flatMap((row) =>
          row.sourceUrl === null ? [] : [{ id: row.id, sourceUrl: row.sourceUrl }],
        ),

    units: (materialId) => unitsOf(orm, materialId),

    requestExtract(materialId, unitNo, ocr) {
      orm.transaction((tx) => {
        rowOf(tx, materialId);
        const unit = tx
          .select()
          .from(materialUnits)
          .where(and(eq(materialUnits.materialId, materialId), eq(materialUnits.unitNo, unitNo)))
          .get();
        if (!unit) {
          throw new MaterialNotFoundError();
        }
        tx.update(materialUnits)
          .set({
            status: 'pending',
            generation: unit.generation + 1,
            textSource: ocr ? 'ocr' : unit.textSource,
          })
          .where(and(eq(materialUnits.materialId, materialId), eq(materialUnits.unitNo, unitNo)))
          .run();
        // Los resultados guardados se quedan (solo se agregan); lo que cambia es qué tareas
        // quedan: la de esta página se hace de nuevo y la cadena de después también.
        tx.delete(ingestTasks)
          .where(
            and(
              eq(ingestTasks.materialId, materialId),
              or(
                and(eq(ingestTasks.stage, 'extract'), eq(ingestTasks.unitNo, unitNo)),
                inArray(ingestTasks.stage, ['structure', 'normalize', 'index']),
              ),
            ),
          )
          .run();
        addTask(tx, materialId, 'extract', unitNo);
        touch(tx, materialId);
      });
    },

    setExcluded(materialId, unitNos, excluded) {
      orm.transaction((tx) => {
        rowOf(tx, materialId);
        if (unitNos.length > 0) {
          tx.update(materialUnits)
            .set({ excluded: excluded ? 1 : 0 })
            .where(
              and(
                eq(materialUnits.materialId, materialId),
                inArray(materialUnits.unitNo, [...unitNos]),
              ),
            )
            .run();
        }
        touch(tx, materialId);
      });
    },

    corrections: (materialId) =>
      orm
        .select()
        .from(blockCorrections)
        .where(eq(blockCorrections.materialId, materialId))
        .orderBy(asc(blockCorrections.createdAt), asc(blockCorrections.id))
        .all(),

    correction: (correctionId) =>
      orm.select().from(blockCorrections).where(eq(blockCorrections.id, correctionId)).get(),

    saveCorrection({ materialId, unit, key, before, after, pendingCards }) {
      const now = clock.now().toISOString();
      return orm.transaction((tx) => {
        rowOf(tx, materialId);
        const existing = tx
          .select()
          .from(blockCorrections)
          .where(
            and(
              eq(blockCorrections.materialId, materialId),
              eq(blockCorrections.unitNo, unit),
              eq(blockCorrections.blockKey, key),
            ),
          )
          .get();
        if (existing) {
          tx.update(blockCorrections)
            .set({
              afterText: after,
              state: 'applied',
              pendingCards: JSON.stringify(pendingCards),
              updatedAt: now,
            })
            .where(eq(blockCorrections.id, existing.id))
            .run();
          return existing.id;
        }
        const id = newId();
        tx.insert(blockCorrections)
          .values({
            id,
            materialId,
            unitNo: unit,
            blockKey: key,
            beforeText: before,
            afterText: after,
            state: 'applied',
            pendingCards: JSON.stringify(pendingCards),
            createdAt: now,
            updatedAt: now,
          })
          .run();
        return id;
      });
    },

    dropCorrection(correctionId) {
      orm.delete(blockCorrections).where(eq(blockCorrections.id, correctionId)).run();
    },

    // «Mantener mi corrección» sobre un texto de base nuevo: la corrección pasa a ser de ese texto.
    keepCorrection(correctionId, { key, before }) {
      orm
        .update(blockCorrections)
        .set({
          blockKey: key,
          beforeText: before,
          state: 'applied',
          updatedAt: clock.now().toISOString(),
        })
        .where(eq(blockCorrections.id, correctionId))
        .run();
    },

    setPendingCards(correctionId, cardIds) {
      orm
        .update(blockCorrections)
        .set({ pendingCards: JSON.stringify(cardIds), updatedAt: clock.now().toISOString() })
        .where(eq(blockCorrections.id, correctionId))
        .run();
    },

    cardsWithPendingChange(cardId) {
      return orm
        .select({ pendingCards: blockCorrections.pendingCards })
        .from(blockCorrections)
        .where(like(blockCorrections.pendingCards, `%"${cardId}"%`))
        .all()
        .some((row) => (JSON.parse(row.pendingCards) as string[]).includes(cardId));
    },

    resolutions: (materialId) =>
      orm
        .select()
        .from(problemResolutions)
        .where(eq(problemResolutions.materialId, materialId))
        .all(),

    setResolution(materialId, unitNo, problemKey, resolution) {
      orm.transaction((tx) => {
        rowOf(tx, materialId);
        const where = and(
          eq(problemResolutions.materialId, materialId),
          eq(problemResolutions.unitNo, unitNo),
          eq(problemResolutions.problemKey, problemKey),
        );
        tx.delete(problemResolutions).where(where).run();
        if (resolution !== null) {
          tx.insert(problemResolutions)
            .values({
              materialId,
              unitNo,
              problemKey,
              resolution,
              createdAt: clock.now().toISOString(),
            })
            .run();
        }
        touch(tx, materialId);
      });
    },

    findByHash: (hash) =>
      orm
        .select()
        .from(materials)
        .where(
          and(
            eq(materials.originalSha256, hash),
            isNull(materials.deletedAt),
            isNull(materials.errorCode),
          ),
        )
        .orderBy(asc(materials.addedAt))
        .get(),

    findByName(subjectId, name) {
      const wanted = name.normalize('NFC').toLowerCase();
      return orm
        .select()
        .from(materials)
        .where(
          and(
            eq(materials.subjectId, subjectId),
            isNull(materials.deletedAt),
            isNull(materials.errorCode),
          ),
        )
        .orderBy(asc(materials.addedAt))
        .all()
        .find((row) => row.originalName.normalize('NFC').toLowerCase() === wanted);
    },

    row: (materialId) => rowOf(orm, materialId),

    summaries: (subjectId) =>
      orm
        .select()
        .from(materials)
        .where(and(eq(materials.subjectId, subjectId), isNull(materials.deletedAt)))
        .orderBy(asc(materials.addedAt), asc(materials.id))
        .all()
        .map((row) => summaryOf(orm, row)),

    summary: (materialId) => summaryOf(orm, rowOf(orm, materialId)),

    detail(materialId) {
      const row = rowOf(orm, materialId);
      const units = unitsOf(orm, materialId);
      const sections = orm
        .select()
        .from(materialBlocks)
        .where(and(eq(materialBlocks.materialId, materialId), eq(materialBlocks.type, 'section')))
        .orderBy(asc(materialBlocks.position))
        .all();
      return {
        ...summaryOf(orm, row),
        units: units.map((unit) => ({
          unit: unit.unitNo,
          status: unit.status as UnitStatus,
          chars: unit.charCount,
        })),
        sections: sections.map((section) => ({
          blockId: section.id,
          title: section.normalizedText,
          level: Math.max(1, section.level),
          unit: section.unitNo,
        })),
      };
    },

    next: () => pick(queueItems(orm)),
    peek: () => pick(queueItems(orm)),

    recover(runnerId, now) {
      return orm.transaction((tx) => {
        const running = tx
          .select()
          .from(ingestTasks)
          .where(eq(ingestTasks.status, 'running'))
          .all()
          .map(toTask);
        let changed = 0;
        for (const task of running) {
          const next = recoverTask(toState(task), { runnerId, now });
          if (next) {
            writeTask(tx, task, next);
            if (next.status === 'review') {
              afterReview(tx, task);
            }
            changed++;
          }
        }
        return changed;
      });
    },

    release(taskId) {
      orm.transaction((tx) => {
        const task = taskRow(tx, taskId);
        const next = task ? releaseTask(toState(task)) : null;
        if (task && next) {
          writeTask(tx, task, next);
        }
      });
    },

    start(taskId, runnerId, now) {
      return orm.transaction((tx) => {
        const task = taskRow(tx, taskId);
        if (task?.status !== 'pending') {
          return null;
        }
        const next = startTask(toState(task), runnerId, now);
        writeTask(tx, task, next);
        return { ...task, ...next };
      });
    },

    heartbeat(taskId, runnerId, now) {
      orm
        .update(ingestTasks)
        .set({ heartbeatAt: now })
        .where(
          and(
            eq(ingestTasks.id, taskId),
            eq(ingestTasks.runnerId, runnerId),
            eq(ingestTasks.status, 'running'),
          ),
        )
        .run();
    },

    task: (taskId) => taskRow(orm, taskId),

    result(key) {
      const found = orm
        .select({ output: ingestResults.output })
        .from(ingestResults)
        .where(eq(ingestResults.key, key))
        .get();
      return found ? (JSON.parse(gunzipSync(found.output).toString('utf8')) as unknown) : undefined;
    },

    resultKey: ({ originalSha256, unit, stage, tool, toolVersion, params }) =>
      sha256(stageKeyInput({ originalSha256, unit, stage, tool, toolVersion, params })),

    completeValidate(taskId, saved, units) {
      orm.transaction((tx) => {
        const task = taskRow(tx, taskId);
        if (task?.status !== 'running') {
          return;
        }
        const material = rowOf(tx, task.materialId);
        saveResult(tx, task, material, saved);
        tx.update(materials)
          .set({ unitCount: units.length })
          .where(eq(materials.id, material.id))
          .run();
        for (const unit of units) {
          tx.insert(materialUnits)
            .values({
              materialId: material.id,
              unitNo: unit.unit,
              width: unit.width,
              height: unit.height,
            })
            .onConflictDoNothing()
            .run();
          addTask(tx, material.id, 'extract', unit.unit);
        }
        markDone(tx, taskId, saved.key);
        touch(tx, material.id);
      });
    },

    completeExtract(taskId, saved, unit) {
      orm.transaction((tx) => {
        const task = taskRow(tx, taskId);
        if (task?.status !== 'running') {
          return;
        }
        const material = rowOf(tx, task.materialId);
        saveResult(tx, task, material, saved);
        tx.update(materialUnits)
          .set({
            status: unit.status,
            charCount: unit.chars,
            paragraphCount: unit.paragraphs,
            ...(unit.textSource ? { textSource: unit.textSource } : {}),
            ocrConfidence: unit.ocrConfidence ?? null,
          })
          .where(
            and(eq(materialUnits.materialId, material.id), eq(materialUnits.unitNo, task.unitNo)),
          )
          .run();
        markDone(tx, taskId, saved.key);
        afterExtract(tx, material.id);
        touch(tx, material.id);
      });
    },

    completeStage(taskId, saved) {
      orm.transaction((tx) => {
        const task = taskRow(tx, taskId);
        if (task?.status !== 'running') {
          return;
        }
        const material = rowOf(tx, task.materialId);
        saveResult(tx, task, material, saved);
        markDone(tx, taskId, saved.key);
        const next = NEXT[task.stage];
        if (next) {
          addTask(tx, material.id, next, 0);
        }
        touch(tx, material.id);
      });
    },

    replaceBlocks(materialId, blocks, outcomes = {}) {
      orm.transaction((tx) => {
        writeBlocks(tx, rowOf(tx, materialId).id, blocks, outcomes);
        touch(tx, materialId);
      });
    },

    setTitle(materialId, title) {
      orm
        .update(materials)
        .set({ title, updatedAt: clock.now().toISOString() })
        .where(eq(materials.id, materialId))
        .run();
    },

    completeIndex(taskId, blocks, outcomes = {}) {
      orm.transaction((tx) => {
        const task = taskRow(tx, taskId);
        if (task?.status !== 'running') {
          return;
        }
        const material = rowOf(tx, task.materialId);
        writeBlocks(tx, material.id, blocks, outcomes);
        tx.update(materials)
          .set({ pipelineVersion: PIPELINE_VERSION })
          .where(eq(materials.id, material.id))
          .run();
        markDone(tx, taskId, null);
        touch(tx, material.id);
      });
    },

    failValidation(taskId, problem) {
      orm.transaction((tx) => {
        const task = taskRow(tx, taskId);
        if (!task) {
          return;
        }
        writeTask(tx, task, failTask(toState(task), 'deterministic'));
        tx.update(materials)
          .set({ errorCode: problem, updatedAt: clock.now().toISOString() })
          .where(eq(materials.id, task.materialId))
          .run();
      });
    },

    fail(taskId, kind, problem) {
      return orm.transaction((tx) => {
        const task = taskRow(tx, taskId);
        if (task?.status !== 'running') {
          return task?.status ?? 'cancelled';
        }
        const next = failTask(toState(task), kind);
        writeTask(tx, task, next);
        tx.update(ingestTasks)
          .set({ lastProblem: problem.slice(0, 200) })
          .where(eq(ingestTasks.id, taskId))
          .run();
        if (next.status === 'review' || next.status === 'failed') {
          afterReview(tx, task);
        }
        touch(tx, task.materialId);
        return next.status;
      });
    },

    stageOutputs(materialId, stage) {
      const done = tasksOf(orm, materialId).filter(
        (task) => task.stage === stage && task.status === 'done' && task.resultKey !== null,
      );
      return done.map((task) => {
        const found = orm
          .select({ output: ingestResults.output })
          .from(ingestResults)
          .where(eq(ingestResults.key, task.resultKey as string))
          .get();
        return {
          unit: task.unitNo,
          key: task.resultKey as string,
          output: found ? (JSON.parse(gunzipSync(found.output).toString('utf8')) as unknown) : null,
        };
      });
    },

    cancel(materialId) {
      orm.transaction((tx) => {
        rowOf(tx, materialId);
        tx.update(ingestTasks)
          .set({
            status: 'cancelled',
            runnerId: null,
            heartbeatAt: null,
            updatedAt: clock.now().toISOString(),
          })
          .where(
            and(
              eq(ingestTasks.materialId, materialId),
              inArray(ingestTasks.status, ['pending', 'running']),
            ),
          )
          .run();
        touch(tx, materialId);
      });
    },

    resume(materialId) {
      orm.transaction((tx) => {
        rowOf(tx, materialId);
        tx.update(ingestTasks)
          .set({ status: 'pending', updatedAt: clock.now().toISOString() })
          .where(and(eq(ingestTasks.materialId, materialId), eq(ingestTasks.status, 'cancelled')))
          .run();
        touch(tx, materialId);
      });
    },

    dismiss(materialId) {
      orm.transaction((tx) => {
        rowOf(tx, materialId);
        const now = clock.now().toISOString();
        tx.update(materials)
          .set({ deletedAt: now, updatedAt: now })
          .where(eq(materials.id, materialId))
          .run();
        tx.update(ingestTasks)
          .set({ status: 'cancelled', updatedAt: now })
          .where(
            and(
              eq(ingestTasks.materialId, materialId),
              inArray(ingestTasks.status, ['pending', 'running']),
            ),
          )
          .run();
      });
    },

    blocks: (materialId) =>
      orm
        .select()
        .from(materialBlocks)
        .where(eq(materialBlocks.materialId, materialId))
        .orderBy(asc(materialBlocks.position))
        .all(),

    unit: (materialId, unit) =>
      orm
        .select()
        .from(materialUnits)
        .where(and(eq(materialUnits.materialId, materialId), eq(materialUnits.unitNo, unit)))
        .get(),

    unitTexts(materialId) {
      return unitTexts(blockInputs(this.blocks(materialId)));
    },
  };
}

// Los bloques como los necesitan las reglas de las citas.
export function blockInputs(rows: readonly BlockRow[]) {
  return rows.map((row) => {
    const locator = JSON.parse(row.locator) as BlockLocator;
    return {
      id: row.id,
      unit: row.unitNo,
      type: row.type as BlockType,
      normalized: row.normalizedText,
      lines: locator.lines,
    };
  });
}

// La cita de una tarjeta, como la muestra su ficha: la referencia, la frase y si todavía se
// encuentra en el original.
export function describeCite(
  db: Writer,
  stored: string | null,
): {
  materialId: string;
  reference: string;
  quote: string;
  status: 'located' | 'pending' | 'relocate';
} | null {
  if (stored === null) {
    return null;
  }
  let cite: StoredCite;
  try {
    cite = JSON.parse(stored) as StoredCite;
  } catch {
    return null;
  }
  const material = db.select().from(materials).where(eq(materials.id, cite.materialId)).get();
  // La página que se nombra es donde empieza la frase en la hoja (puede ser la siguiente a la de
  // su párrafo, si el párrafo sigue en la página de al lado).
  const reference = referenceOf(
    material?.title ?? '',
    cite.locator.kind,
    cite.locator.boxes?.[0]?.page ?? cite.locator.page,
    cite.locator.headingPath,
  );
  const base = { materialId: cite.materialId, reference, quote: cite.quote };
  if (!material || material.deletedAt !== null) {
    return { ...base, status: 'relocate' };
  }
  const indexed = db
    .select({ id: ingestTasks.id })
    .from(ingestTasks)
    .where(
      and(
        eq(ingestTasks.materialId, material.id),
        eq(ingestTasks.stage, 'index'),
        eq(ingestTasks.status, 'done'),
      ),
    )
    .get();
  if (!indexed) {
    return { ...base, status: 'pending' };
  }
  const rows = db
    .select()
    .from(materialBlocks)
    .where(eq(materialBlocks.materialId, material.id))
    .orderBy(asc(materialBlocks.position))
    .all();
  const located = relocateQuote(unitTexts(blockInputs(rows)), {
    unit: cite.locator.page,
    quote: cite.quote,
    before: cite.locator.before,
    after: cite.locator.after,
  });
  return { ...base, status: located.status === 'located' ? 'located' : 'relocate' };
}
