import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { type Clock, type Stopwatch, systemStopwatch } from '../../core/clock';
import { TEXT_TYPES } from '../../core/materials/blocks';
import { type FailureKind, HEARTBEAT_MS } from '../../core/materials/queue';
import { boxesFor, quoteContext, relocateQuote } from '../../core/materials/relocate';
import type { ErrorProblem, Stage } from '../../core/materials/status';
import { newId } from '../../data/ids';
import {
  type BlockLocator,
  blockInputs,
  type IndexedBlock,
  type MaterialRow,
  type QueueItem,
  referenceOf,
  type StoredCite,
} from '../../data/materials';
import type { Workspace } from '../../data/workspace';
import type { MaterialEvent } from '../../preload/contract/events';
import type {
  AddResult,
  MaterialDetail,
  MaterialOpen,
  MaterialPage,
  MaterialSelection,
  MaterialSummary,
} from '../../preload/contract/materials';
import { WorkerProblem } from '../supervisor';
import {
  extractResult,
  type MaterialsTask,
  normalizeResult,
  structureResult,
  TOOLS,
  validateResult,
} from '../workers/protocol';
import { originalPath } from './originals';
import { type Received, receiveFile, receiveText } from './receive';

// Los materiales en el proceso principal (H-25 y H-26): recibir archivos y textos, decidir qué
// hacer con un duplicado, correr la cola etapa por etapa (cada etapa, si ya se hizo con el mismo
// contenido y la misma herramienta, reutiliza lo hecho), y lo que se hace con un material listo:
// leer sus páginas, abrir el original en una cita, crear una tarjeta desde una frase y guardar un
// extracto en la Bandeja. El trabajo pesado lo hace el proceso de trabajo (`execute`); acá solo se
// decide y se guarda.

export interface MaterialsService {
  addFiles(input: {
    paths: string[];
    subjectId: string;
    title?: string | undefined;
  }): Promise<{ results: AddResult[] }>;
  addText(input: {
    subjectId: string;
    text: string;
    title?: string | undefined;
  }): Promise<AddResult>;
  decide(input: {
    pendingId: string;
    decision: 'open' | 'newVersion' | 'addAnyway';
  }): Promise<{ materialId: string }>;
  list(input: { subjectId: string }): { materials: MaterialSummary[] };
  get(input: { materialId: string }): MaterialDetail;
  cancel(input: { materialId: string }): MaterialSummary;
  resume(input: { materialId: string }): MaterialSummary;
  dismiss(input: { materialId: string }): Record<string, never>;
  page(input: { materialId: string; unit: number }): MaterialPage;
  open(input: {
    materialId: string;
    cardId?: string | undefined;
    blockId?: string | undefined;
    unit?: number | undefined;
    text?: string | undefined;
  }): MaterialOpen;
  createCard(input: {
    materialId: string;
    selection: MaterialSelection;
    question: string;
    answer: string;
  }): { cardId: string };
  saveExcerpt(input: { materialId: string; selection: MaterialSelection }): { count: number };
  // La cola: arrancarla (vuelven a «pendiente» las tareas «en curso» de otro arranque), esperar a que
  // no quede nada, una tarea por vez (pruebas), pausarla y soltarla sin escribir nada (pruebas del
  // corte).
  start(): void;
  whenIdle(): Promise<void>;
  nextTask(): { stage: Stage; unit: number } | null;
  step(): Promise<void>;
  recoverStale(): number;
  // Frena la cola (la tarea en curso vuelve a «pendiente» sin contar intento) y espera a que no
  // quede nada corriendo: antes de restaurar una copia, al suspenderse Windows.
  pause(): Promise<void>;
  unpause(): void;
  stop(): Promise<void>;
  abandon(): void;
}

const DEFAULT_TIMEOUTS = { validate: 30_000, extract: 30_000, document: 60_000 };
// Cuánto espera «Procesar despacio» antes de cada página.
const SLOW_DELAY_MS = 2000;

class AbandonedError extends Error {}

function failureOf(error: unknown): { kind: FailureKind; problem: string } {
  if (error instanceof WorkerProblem) {
    const kind: FailureKind =
      error.problem === 'timeout'
        ? 'timeout'
        : error.problem === 'memory'
          ? 'memory'
          : error.problem === 'crashed'
            ? 'crashed'
            : 'unknown';
    return { kind, problem: error.problem };
  }
  return { kind: 'unknown', problem: error instanceof Error ? error.name : 'desconocido' };
}

const titleFromName = (name: string) => name.replace(/\.[^.]+$/, '').trim() || name;

function firstLine(text: string): string {
  const line =
    text
      .split('\n')
      .map((part) => part.replace(/^#+\s*/, '').trim())
      .find((part) => part !== '') ?? '';
  return line.length > 80 ? `${line.slice(0, 79).trimEnd()}…` : line;
}

export function createMaterialsService({
  workspace,
  execute,
  emit = () => undefined,
  slow = () => false,
  sleep = (ms) => new Promise((wake) => setTimeout(wake, ms)),
  runnerId = randomUUID(),
  stopwatch = systemStopwatch(),
  timeouts = {},
  autoStart = true,
  interrupt = () => undefined,
}: {
  workspace: Workspace;
  clock: Clock;
  execute: (task: MaterialsTask, timeoutMs: number) => Promise<unknown>;
  emit?: (event: MaterialEvent) => void;
  slow?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  runnerId?: string;
  stopwatch?: Stopwatch;
  timeouts?: Partial<Record<'validate' | 'extract' | 'document', number>>;
  autoStart?: boolean;
  // Corta la tarea que está corriendo en el proceso de trabajo (al cancelar o pausar).
  interrupt?: () => void;
}): MaterialsService {
  const elapsed = stopwatch.start();
  const limits = { ...DEFAULT_TIMEOUTS, ...timeouts };
  const store = () => workspace.materials;
  const dirs = () => ({
    tmpDir: join(workspace.dataDir, 'tmp'),
    originalsDir: workspace.originalsDir,
  });
  let started = false;
  let paused = false;
  let abandoned = false;
  let running: Promise<void> | null = null;
  let current: { taskId: string; materialId: string } | null = null;
  let releasing = false;
  // La tarea que corre terminó el material (avisó «terminó» o «falló»): no hace falta otro aviso.
  let finished = false;
  const pending = new Map<
    string,
    {
      received: Extract<Received, { ok: true }>;
      subjectId: string;
      title: string;
      existing: MaterialRow;
    }
  >();
  // Cada 10 s: una tarea «en curso» sin latido hace más de 15 s vuelve a «pendiente». Si la carpeta
  // de datos está cerrada o se está reemplazando (restaurar una copia), se espera a la próxima.
  const staleTimer = setInterval(() => {
    if (!started || abandoned) {
      return;
    }
    try {
      if (recoverStale() > 0) {
        kick();
      }
    } catch {
      // La base no está disponible ahora: la próxima vuelta lo intenta de nuevo.
    }
  }, 10_000);
  staleTimer.unref?.();

  const safeEmit = (event: MaterialEvent) => {
    if (abandoned) {
      return;
    }
    try {
      emit(event);
    } catch {
      // Una ventana cerrada no frena la cola.
    }
  };

  const withTimeout = <T>(work: Promise<T>, ms: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new WorkerProblem('timeout')), ms);
      work.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });

  const run = async (task: MaterialsTask, ms: number) => {
    const result = await withTimeout(execute(task, ms), ms);
    if (abandoned) {
      throw new AbandonedError();
    }
    return result;
  };

  const fileOf = (item: QueueItem) => {
    const path = originalPath(workspace.originalsDir, item.originalSha256, item.originalExt);
    if (path === null) {
      throw new Error('Un material sin original');
    }
    return path;
  };

  // El resultado de una etapa: el guardado, si ya se hizo con lo mismo; si no, el del proceso.
  const cachedOr = async (
    item: QueueItem,
    stage: Stage,
    unit: number,
    meta: { tool: string; toolVersion: string },
    params: unknown,
    work: () => Promise<unknown>,
  ) => {
    const key = store().resultKey({
      originalSha256: item.originalSha256,
      unit,
      stage,
      ...meta,
      params,
    });
    const saved = store().result(key);
    if (saved !== undefined) {
      return { key, output: saved, fresh: false };
    }
    return { key, output: await work(), fresh: true };
  };

  const formatTool = (kind: QueueItem['kind']) => TOOLS[kind];

  async function runStage(item: QueueItem): Promise<void> {
    const row = store().row(item.materialId);
    const meta = formatTool(item.kind);
    switch (item.stage) {
      case 'validate': {
        const declaredWord = /\.docx$/i.test(row.originalName);
        const params = { format: item.kind, declaredWord };
        const { key, output } = await cachedOr(item, 'validate', 0, meta, params, () =>
          run(
            { kind: 'validate', format: item.kind, file: fileOf(item), declaredWord },
            limits.validate,
          ),
        );
        const parsed = validateResult.parse(output);
        if ('unreadable' in parsed) {
          store().failValidation(item.id, parsed.unreadable as ErrorProblem);
          safeEmit({ type: 'material.failed', materialId: item.materialId });
          finished = true;
          return;
        }
        store().completeValidate(item.id, { key, output: parsed, ...meta, params }, parsed.units);
        return;
      }
      case 'extract': {
        if (slow()) {
          await sleep(SLOW_DELAY_MS);
          if (abandoned) {
            throw new AbandonedError();
          }
        }
        const params = { format: item.kind };
        const limit = item.kind === 'pdf' ? limits.extract : limits.document;
        const { key, output } = await cachedOr(item, 'extract', item.unitNo, meta, params, () =>
          run({ kind: 'extract', format: item.kind, file: fileOf(item), unit: item.unitNo }, limit),
        );
        const parsed = extractResult.parse(output);
        let chars: number;
        let paragraphs = 0;
        if (parsed.format === 'pdf') {
          chars = parsed.page.items.reduce((total, part) => total + part.text.trim().length, 0);
        } else {
          chars = parsed.drafts.reduce(
            (total, draft) =>
              total + draft.lines.reduce((sum, line) => sum + line.text.trim().length, 0),
            0,
          );
          paragraphs = parsed.drafts.filter((draft) => TEXT_TYPES.includes(draft.type)).length;
        }
        store().completeExtract(
          item.id,
          { key, output: parsed, ...meta, params },
          {
            status: chars > 0 ? 'ready' : 'no_text',
            chars,
            paragraphs,
          },
        );
        return;
      }
      case 'structure': {
        const inputs = store().stageOutputs(item.materialId, 'extract');
        const keys = inputs.map((input) => input.key).sort();
        const validated = store().stageOutputs(item.materialId, 'validate')[0]?.output;
        const outline =
          validated && typeof validated === 'object' && 'outline' in validated
            ? ((validated as { outline: { title: string; page: number | null; level: number }[] })
                .outline ?? [])
            : [];
        const params = { inputs: keys, outline: outline.length };
        const { key, output } = await cachedOr(
          item,
          'structure',
          0,
          TOOLS.structure,
          params,
          () => {
            const extracted = inputs
              .map((input) => extractResult.parse(input.output))
              .sort((a, b) =>
                a.format === 'pdf' && b.format === 'pdf' ? a.page.page - b.page.page : 0,
              );
            const pages = extracted.flatMap((entry) =>
              entry.format === 'pdf' ? [entry.page] : [],
            );
            const drafts = extracted.flatMap((entry) =>
              entry.format === 'pdf' ? [] : entry.drafts,
            );
            return run(
              { kind: 'structure', format: item.kind, pages, drafts, outline },
              limits.document + 500 * pages.length,
            );
          },
        );
        const parsed = structureResult.parse(output);
        store().completeStage(item.id, { key, output: parsed, ...TOOLS.structure, params });
        return;
      }
      case 'normalize': {
        const [structure] = store().stageOutputs(item.materialId, 'structure');
        if (!structure) {
          throw new Error('Falta la estructura');
        }
        const drafts = structureResult.parse(structure.output).drafts;
        const params = { input: structure.key };
        const { key, output } = await cachedOr(item, 'normalize', 0, TOOLS.normalize, params, () =>
          run({ kind: 'normalize', drafts }, limits.document + 500 * (row.unitCount ?? 1)),
        );
        const parsed = normalizeResult.parse(output);
        store().completeStage(item.id, { key, output: parsed, ...TOOLS.normalize, params });
        return;
      }
      case 'index': {
        const [normalized] = store().stageOutputs(item.materialId, 'normalize');
        if (!normalized) {
          throw new Error('Falta la normalización');
        }
        const { blocks } = normalizeResult.parse(normalized.output);
        const ids = blocks.map(() => newId());
        let paragraphIndex = 0;
        const indexed: IndexedBlock[] = blocks.map((block, index) => {
          const locator: BlockLocator = {
            kind: item.kind === 'pdf' ? 'pdf' : 'flow',
            page: block.unit,
            lines: block.lines.map((line) => ({ norm: line.norm, box: line.box })),
            headingPath: block.headingPath,
            paragraphIndex: TEXT_TYPES.includes(block.type) ? paragraphIndex++ : -1,
          };
          return {
            id: ids[index] as string,
            parentId: block.parent === null ? null : (ids[block.parent] ?? null),
            type: block.type,
            level: block.level,
            unit: block.unit,
            raw: block.raw,
            normalized: block.normalized,
            transformations: block.transformations,
            locator,
          };
        });
        store().completeIndex(item.id, indexed);
        safeEmit({ type: 'material.done', materialId: item.materialId });
        finished = true;
        return;
      }
    }
  }

  async function runOne(item: QueueItem): Promise<void> {
    let task: ReturnType<ReturnType<typeof store>['start']>;
    try {
      task = store().start(item.id, runnerId, elapsed());
    } catch {
      // La base no está disponible ahora (se cerró o se está reemplazando).
      return;
    }
    if (!task) {
      return;
    }
    current = { taskId: task.id, materialId: task.materialId };
    const heartbeat = setInterval(() => {
      if (!abandoned) {
        try {
          store().heartbeat(task.id, runnerId, elapsed());
        } catch {
          // La base se está reemplazando (restaurar una copia): el próximo latido llega.
        }
      }
    }, HEARTBEAT_MS);
    heartbeat.unref?.();
    try {
      await runStage({ ...item, ...task });
    } catch (error) {
      if (abandoned || error instanceof AbandonedError) {
        return;
      }
      if (releasing) {
        store().recover(`${runnerId}:pausa`, elapsed());
        return;
      }
      const { kind, problem } = failureOf(error);
      try {
        store().fail(task.id, kind, problem);
      } catch {
        // El material ya no está (lo quitaste de la lista): no hay nada que marcar.
      }
    } finally {
      clearInterval(heartbeat);
      current = null;
      releasing = false;
      if (!finished) {
        safeEmit({ type: 'material.progress', materialId: item.materialId });
      }
      finished = false;
    }
  }

  async function loop(): Promise<void> {
    while (started && !paused && !abandoned) {
      let item: QueueItem | null;
      try {
        item = store().next();
      } catch {
        return;
      }
      if (!item) {
        return;
      }
      await runOne(item);
    }
  }

  function kick(): void {
    if (!started || paused || abandoned || running) {
      return;
    }
    running = loop()
      .catch((error: unknown) => {
        console.error('Retenia: la cola de materiales se frenó', error);
      })
      .finally(() => {
        running = null;
      });
  }

  function recoverStale(): number {
    return store().recover(runnerId, elapsed());
  }

  function start(): void {
    if (abandoned) {
      return;
    }
    if (!started) {
      started = true;
      recoverStale();
    }
    kick();
  }

  // Lo que se hace con un archivo recibido que no es un duplicado.
  const addReceived = (
    received: Received,
    subjectId: string,
    title?: string,
    previous?: MaterialRow,
  ) => {
    if (!received.ok) {
      return store().create({
        subjectId,
        title: title || titleFromName(received.name),
        kind: null,
        originalSha256: null,
        originalName: received.name,
        originalExt: null,
        sizeBytes: received.size,
        errorCode: received.problem,
      });
    }
    return store().create({
      subjectId,
      title: title || titleFromName(received.name),
      kind: received.kind,
      originalSha256: received.sha256,
      originalName: received.name,
      originalExt: received.ext,
      sizeBytes: received.size,
      errorCode: null,
      previousMaterialId: previous?.id ?? null,
      versionNo: previous ? previous.versionNo + 1 : 1,
    });
  };

  const offer = (received: Received, subjectId: string, title: string): AddResult => {
    if (received.ok) {
      const byHash = store().findByHash(received.sha256);
      const byName = byHash ? undefined : store().findByName(subjectId, received.name);
      const existing = byHash ?? byName;
      if (existing) {
        const pendingId = randomUUID();
        pending.set(pendingId, { received, subjectId, title, existing });
        return {
          outcome: 'duplicate',
          pendingId,
          existing: {
            materialId: existing.id,
            name: existing.originalName,
            day: store().summary(existing.id).addedDay,
          },
        };
      }
    }
    const materialId = addReceived(received, subjectId, title);
    safeEmit({ type: 'material.progress', materialId });
    return { outcome: 'added', materialId };
  };

  // La página de un material: sus bloques (los de un PDF, los que tocan esa hoja), con las tarjetas
  // que citan cada uno.
  const citesOf = (materialId: string) => {
    const texts = store().unitTexts(materialId);
    return workspace.cards.citing(materialId).flatMap(({ cardId, question, sourceCite }) => {
      const stored = parseCite(sourceCite);
      if (!stored || stored.materialId !== materialId) {
        return [];
      }
      const located = relocateQuote(texts, {
        unit: stored.locator.page,
        quote: stored.quote,
        before: stored.locator.before,
        after: stored.locator.after,
      });
      if (located.status !== 'located') {
        return [];
      }
      const unit = texts.find((entry) => entry.unit === located.unit);
      const block = unit?.blocks.find(
        (entry) => entry.start <= located.start && located.start < entry.end,
      );
      return block ? [{ blockId: block.id, cardId, question }] : [];
    });
  };

  const parseCite = (raw: string | null): StoredCite | null => {
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as StoredCite;
    } catch {
      return null;
    }
  };

  const storedCiteOf = (cardId: string): StoredCite | null =>
    parseCite(workspace.cards.sourceCite(cardId));

  // Una selección del visor, como cita: la unidad, el tramo, la frase, su contexto y sus cajas.
  const citeOf = (materialId: string, selection: MaterialSelection) => {
    const row = store().row(materialId);
    const texts = store().unitTexts(materialId);
    const unit = texts.find((entry) =>
      entry.blocks.some((block) => block.id === selection.from.blockId),
    );
    const fromBlock = unit?.blocks.find((block) => block.id === selection.from.blockId);
    if (!unit || !fromBlock) {
      throw new Error('La selección no es de este material');
    }
    const toBlock = unit.blocks.find((block) => block.id === selection.to.blockId) ?? fromBlock;
    let start = Math.min(fromBlock.start + selection.from.offset, fromBlock.end);
    let end = Math.min(toBlock.start + selection.to.offset, toBlock.end);
    if (end < start) {
      [start, end] = [end, start];
    }
    while (start < end && /\s/u.test(unit.text[start] ?? '')) {
      start++;
    }
    while (end > start && /\s/u.test(unit.text[end - 1] ?? '')) {
      end--;
    }
    const quote = unit.text.slice(start, end);
    if (quote === '') {
      throw new Error('La selección está vacía');
    }
    const blockRow = store()
      .blocks(materialId)
      .find((block) => block.id === fromBlock.id);
    const locatorOfBlock = blockRow ? (JSON.parse(blockRow.locator) as BlockLocator) : null;
    const kind: 'pdf' | 'flow' = row.kind === 'pdf' ? 'pdf' : 'flow';
    const headingPath = locatorOfBlock?.headingPath ?? [];
    const { before, after } = quoteContext(unit.text, start, end);
    const boxes = boxesFor(unit.spans, start, end);
    const reference = referenceOf(row.title, kind, unit.unit, headingPath);
    const cite: StoredCite = {
      materialId,
      originalSha256: row.originalSha256 ?? '',
      materialVersion: row.versionNo,
      pipelineVersion: row.pipelineVersion,
      locator: {
        kind,
        page: unit.unit,
        boxes,
        quote,
        before,
        after,
        paragraphIndex: locatorOfBlock?.paragraphIndex ?? -1,
        headingPath,
      },
      quote,
    };
    return { row, cite, reference, quote };
  };

  const service: MaterialsService = {
    async addFiles({ paths, subjectId, title }) {
      const results: AddResult[] = [];
      for (const path of paths) {
        const received = await receiveFile(path, dirs());
        results.push(offer(received, subjectId, title ?? ''));
      }
      kick();
      return { results };
    },

    async addText({ subjectId, text, title }) {
      const name = title?.trim() || firstLine(text) || 'Texto';
      const received = await receiveText(text, `${name}.txt`, dirs());
      const result = offer(received, subjectId, name);
      kick();
      return result;
    },

    async decide({ pendingId, decision }) {
      const choice = pending.get(pendingId);
      if (!choice) {
        throw new Error('Esa decisión ya no está pendiente');
      }
      pending.delete(pendingId);
      const { received, subjectId, title, existing } = choice;
      if (decision === 'open') {
        // Un original nuevo (mismo nombre, otro contenido) que nadie usa no se guarda.
        if (received.sha256 !== existing.originalSha256 && !store().findByHash(received.sha256)) {
          const path = originalPath(workspace.originalsDir, received.sha256, received.ext);
          if (path) {
            await rm(path, { force: true }).catch(() => undefined);
          }
        }
        return { materialId: existing.id };
      }
      const materialId = addReceived(
        received,
        subjectId,
        title,
        decision === 'newVersion' ? existing : undefined,
      );
      safeEmit({ type: 'material.progress', materialId });
      kick();
      return { materialId };
    },

    list: ({ subjectId }) => ({ materials: store().summaries(subjectId) }),

    get: ({ materialId }) => store().detail(materialId),

    cancel({ materialId }) {
      store().cancel(materialId);
      if (current?.materialId === materialId) {
        interrupt();
      }
      safeEmit({ type: 'material.progress', materialId });
      return store().summary(materialId);
    },

    resume({ materialId }) {
      store().resume(materialId);
      kick();
      safeEmit({ type: 'material.progress', materialId });
      return store().summary(materialId);
    },

    dismiss({ materialId }) {
      store().dismiss(materialId);
      if (current?.materialId === materialId) {
        interrupt();
      }
      return {};
    },

    page({ materialId, unit }) {
      const row = store().row(materialId);
      const unitRow = store().unit(materialId, unit);
      const isPdf = row.kind === 'pdf';
      const cited = citesOf(materialId);
      const blocks = store()
        .blocks(materialId)
        .map((block) => ({ block, locator: JSON.parse(block.locator) as BlockLocator }))
        .filter(({ block, locator }) =>
          isPdf
            ? block.unitNo === unit || locator.lines.some((line) => line.box?.page === unit)
            : true,
        )
        .map(({ block, locator }) => ({
          id: block.id,
          type: block.type as MaterialPage['blocks'][number]['type'],
          level: block.level,
          unit: block.unitNo,
          text: block.normalizedText,
          headingPath: locator.headingPath,
          boxes: locator.lines.flatMap((line) =>
            line.box && line.box.page === unit ? [line.box] : [],
          ),
          cited: cited
            .filter((entry) => entry.blockId === block.id)
            .map((entry) => ({ cardId: entry.cardId, question: entry.question })),
        }));
      return {
        materialId,
        title: row.title,
        kind: (row.kind ?? 'text') as MaterialPage['kind'],
        unit,
        unitCount: row.unitCount ?? 0,
        status: (unitRow?.status ?? 'pending') as MaterialPage['status'],
        width: unitRow?.width ?? null,
        height: unitRow?.height ?? null,
        blocks,
      };
    },

    open({ materialId, cardId, blockId, unit, text }) {
      const row = store().row(materialId);
      const texts = store().unitTexts(materialId);
      const fallback = unit ?? 1;
      if (cardId) {
        const stored = storedCiteOf(cardId);
        if (!stored || stored.materialId !== materialId) {
          return { materialId, unit: fallback, blockId: null, highlight: [], notFound: true };
        }
        const located = relocateQuote(texts, {
          unit: stored.locator.page,
          quote: stored.quote,
          before: stored.locator.before,
          after: stored.locator.after,
        });
        if (located.status !== 'located') {
          return {
            materialId,
            unit: stored.locator.page,
            blockId: null,
            highlight: [],
            notFound: true,
          };
        }
        const entry = texts.find((candidate) => candidate.unit === located.unit);
        const block = entry?.blocks.find(
          (candidate) => candidate.start <= located.start && located.start < candidate.end,
        );
        return {
          materialId,
          unit: located.unit,
          blockId: block?.id ?? null,
          highlight: entry ? boxesFor(entry.spans, located.start, located.end) : [],
          notFound: false,
        };
      }
      const blocks = blockInputs(store().blocks(materialId));
      const fold = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      const target = blockId
        ? blocks.find((block) => block.id === blockId)
        : text
          ? blocks.find((block) => fold(block.normalized).includes(fold(text)))
          : undefined;
      if (!target) {
        return { materialId, unit: fallback, blockId: null, highlight: [], notFound: false };
      }
      const page = row.kind === 'pdf' ? target.unit : 1;
      return {
        materialId,
        unit: page,
        blockId: target.id,
        highlight: target.lines.flatMap((line) =>
          line.box && line.box.page === page ? [line.box] : [],
        ),
        notFound: false,
      };
    },

    createCard({ materialId, selection, question, answer }) {
      const { row, cite, reference } = citeOf(materialId, selection);
      const card = workspace.cards.createFromMaterial({
        question,
        answer,
        subjectId: row.subjectId,
        sourceText: reference,
        sourceCite: JSON.stringify(cite),
      });
      return { cardId: card.id };
    },

    saveExcerpt({ materialId, selection }) {
      const { cite, reference, quote } = citeOf(materialId, selection);
      return workspace.inbox.capture({
        text: quote,
        source: { materialId, unitNo: cite.locator.page, reference, quote, locator: cite.locator },
      });
    },

    start,

    async whenIdle() {
      for (;;) {
        if (running) {
          await running;
          continue;
        }
        if (started && !paused && !abandoned && store().next()) {
          kick();
          continue;
        }
        return;
      }
    },

    nextTask() {
      const item = store().peek();
      return item ? { stage: item.stage, unit: item.unitNo } : null;
    },

    async step() {
      const item = store().next();
      if (item) {
        await runOne(item);
      }
    },

    recoverStale,

    async pause() {
      paused = true;
      if (current) {
        releasing = true;
        interrupt();
      }
      if (running) {
        await running.catch(() => undefined);
      }
    },

    unpause() {
      paused = false;
      kick();
    },

    async stop() {
      started = false;
      clearInterval(staleTimer);
      if (running) {
        await running.catch(() => undefined);
      }
    },

    abandon() {
      abandoned = true;
      started = false;
      clearInterval(staleTimer);
    },
  };
  if (autoStart) {
    start();
  }
  return service;
}
