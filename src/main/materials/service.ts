import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { type Clock, type Stopwatch, systemStopwatch } from '../../core/clock';
import { type Box, TEXT_TYPES } from '../../core/materials/blocks';
import { applyCorrections, remapQuote } from '../../core/materials/corrections';
import { textLayer } from '../../core/materials/quality';
import { type FailureKind, HEARTBEAT_MS } from '../../core/materials/queue';
import { boxesFor, quoteContext, relocateQuote } from '../../core/materials/relocate';
import type { ErrorProblem, Stage } from '../../core/materials/status';
import { parseWebAddress } from '../../core/materials/web-address';
import { localDateTime } from '../../core/study-day';
import { newId } from '../../data/ids';
import {
  type BlockLocator,
  blockInputs,
  type IndexedBlock,
  type MaterialRow,
  PIPELINE_VERSION,
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
  MaterialReview,
  MaterialSelection,
  MaterialSummary,
} from '../../preload/contract/materials';
import { texts as catalog } from '../../preload/contract/texts';
import { createNetGate, type NetGate } from '../net-gate';
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
import { buildReview, closestBlock, infosOf, offerableBlocks } from './review';
import { downloadPage } from './web-download';

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
  // Una página web por su dirección (Fase 14). Sin conexión queda pendiente y se completa sola.
  addUrl(input: {
    subjectId: string;
    address: string;
    title?: string | undefined;
  }): Promise<AddResult>;
  decide(input: {
    pendingId: string;
    decision: 'open' | 'newVersion' | 'addAnyway';
  }): Promise<{ materialId: string }>;
  snapshot(input: { materialId: string }): {
    html: string;
    address: string | null;
    savedDay: string;
  };
  // La revisión de un material (Fase 14): los tres bloques, las correcciones y la cobertura.
  review(input: { materialId: string }): MaterialReview;
  ocrPage(input: { materialId: string; unit: number }): Record<string, never>;
  reprocessPage(input: { materialId: string; unit: number }): Record<string, never>;
  excludePages(input: { materialId: string; units: number[]; excluded: boolean }): MaterialReview;
  resolveProblem(input: {
    materialId: string;
    problemId: string;
    resolution: 'image' | 'ignored' | null;
  }): MaterialReview;
  correctText(input: { materialId: string; blockId: string; text: string }): {
    correctionId: string;
    cards: { cardId: string; question: string }[];
  };
  updateDerived(input: { correctionId: string; update: boolean }): { updated: number };
  resolveConflict(input: { correctionId: string; keep: boolean }): MaterialReview;
  sourceChange(input: { cardId: string }): { changed: boolean };
  // Los bloques que se pueden ofrecer para generar tarjetas (regla dura, CA-118).
  offerableBlockIds(input: { materialId: string }): string[];
  // Bajar las páginas web que quedaron esperando conexión.
  resumePending(): Promise<void>;
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
  // Lo que se va a citar de una selección (la frase y su referencia), antes de guardarla.
  preview(input: { materialId: string; selection: MaterialSelection }): {
    quote: string;
    reference: string;
  };
  // El pasaje de una selección tal como está guardado, y el título del material (Fase 19): lo que
  // se le manda a la IA sale de acá, nunca del texto de la pantalla.
  fragment(input: { materialId: string; selection: MaterialSelection }): {
    text: string;
    title: string;
  };
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

// Un material se está leyendo, o espera en la cola para leerse.
const isWorkingState = (state: MaterialSummary['state']) =>
  state.kind === 'processing' || (state.kind === 'received' && state.cancelled !== true);

const DEFAULT_TIMEOUTS = { validate: 30_000, extract: 30_000, document: 60_000, ocr: 180_000 };
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

// «es.wikipedia.org/wiki/Mediana»: el título de una página web hasta que se lee la página.
function titleFromAddress(address: string): string {
  try {
    const url = new URL(address);
    const path = decodeURIComponent(url.pathname === '/' ? '' : url.pathname);
    return `${url.host}${path}`.slice(0, 200);
  } catch {
    return address.slice(0, 200);
  }
}

// El primer renglón con letras o números, sin las marcas de título de Markdown: un renglón de
// puras marcas («##», «***») no sirve de título.
function firstLine(text: string): string {
  const line =
    text
      .split('\n')
      .map((part) => part.replace(/^#+\s*/, '').trim())
      .find((part) => /[\p{L}\p{N}]/u.test(part)) ?? '';
  return line.length > 80 ? `${line.slice(0, 79).trimEnd()}…` : line;
}

export function createMaterialsService({
  workspace,
  clock,
  execute,
  emit = () => undefined,
  slow = () => false,
  sleep = (ms) => new Promise((wake) => setTimeout(wake, ms)),
  runnerId = randomUUID(),
  stopwatch = systemStopwatch(),
  timeouts = {},
  autoStart = true,
  interrupt = () => undefined,
  net = createNetGate(),
}: {
  workspace: Workspace;
  clock: Clock;
  execute: (task: MaterialsTask, timeoutMs: number) => Promise<unknown>;
  emit?: (event: MaterialEvent) => void;
  slow?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  runnerId?: string;
  stopwatch?: Stopwatch;
  timeouts?: Partial<Record<'validate' | 'extract' | 'document' | 'ocr', number>>;
  autoStart?: boolean;
  // Corta la tarea que está corriendo en el proceso de trabajo (al cancelar o pausar).
  interrupt?: () => void;
  // La puerta hacia internet (las páginas web): con «Simular sin conexión» falla sin salir.
  net?: NetGate;
}): MaterialsService {
  const elapsed = stopwatch.start();
  const limits = { ...DEFAULT_TIMEOUTS, ...timeouts };
  const store = () => workspace.materials;
  const dirs = () => ({
    tmpDir: join(workspace.dataDir, 'tmp'),
    originalsDir: workspace.originalsDir,
  });
  let started = false;
  // Cuántas pausas hay pedidas (la suspensión de Windows y la restauración de una copia pueden
  // coincidir): la cola sigue recién cuando se sueltan todas.
  let pauses = 0;
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

  // La caja que envuelve a las de una página (un bloque corregido se resalta entero).
  const unionBox = (boxes: readonly Box[]): Box | null => {
    const first = boxes[0];
    if (!first) {
      return null;
    }
    const same = boxes.filter((box) => box.page === first.page);
    const x = Math.min(...same.map((box) => box.x));
    const y = Math.min(...same.map((box) => box.y));
    return {
      page: first.page,
      x,
      y,
      width: Math.max(...same.map((box) => box.x + box.width)) - x,
      height: Math.max(...same.map((box) => box.y + box.height)) - y,
    };
  };

  // Los bloques de un material tal como se guardan: los de la normalización con las correcciones
  // encima. El texto de base de un bloque corregido queda aparte (`base`) y el original, intacto.
  function indexedBlocksOf(materialId: string, kind: QueueItem['kind']) {
    const [normalized] = store().stageOutputs(materialId, 'normalize');
    if (!normalized) {
      throw new Error('Falta la normalización');
    }
    const { blocks } = normalizeResult.parse(normalized.output);
    // Si la lectura dio los mismos bloques de antes, conservan su identificador.
    const existing = store().blocks(materialId);
    const reuse =
      existing.length === blocks.length &&
      existing.every((row, index) => row.type === blocks[index]?.type);
    const ids = blocks.map((_, index) => (reuse ? (existing[index]?.id as string) : newId()));
    const applied = applyCorrections(
      blocks.map((block) => ({ unit: block.unit, type: block.type, base: block.normalized })),
      store()
        .corrections(materialId)
        .map((row) => ({
          id: row.id,
          unit: row.unitNo,
          key: row.blockKey,
          before: row.beforeText,
          after: row.afterText,
        })),
    );
    let paragraphIndex = 0;
    const indexed: IndexedBlock[] = blocks.map((block, index) => {
      const text = applied.texts[index] ?? block.normalized;
      const corrected = text !== block.normalized;
      const boxes = block.lines.flatMap((line) => (line.box ? [line.box] : []));
      const locator: BlockLocator = {
        kind: kind === 'pdf' ? 'pdf' : 'flow',
        page: block.unit,
        lines: corrected
          ? [{ norm: [0, text.length], box: unionBox(boxes) }]
          : block.lines.map((line) => ({ norm: line.norm, box: line.box })),
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
        normalized: text,
        transformations: corrected ? [] : block.transformations,
        locator,
        base: corrected ? block.normalized : null,
      };
    });
    return { indexed, outcomes: applied.outcomes };
  }

  // Vuelve a armar los bloques con lo que hay (una corrección nueva, una decisión sobre un
  // conflicto): no hace falta leer nada de nuevo, así que es al instante.
  function rebuildBlocks(materialId: string): void {
    // Mientras se vuelve a leer una página no hay normalización a la que aplicarle nada: la
    // corrección queda guardada y la aplica la etapa de indexar cuando llegue.
    if (store().stageOutputs(materialId, 'normalize').length === 0) {
      return;
    }
    const row = store().row(materialId);
    const { indexed, outcomes } = indexedBlocksOf(materialId, (row.kind ?? 'text') as never);
    store().replaceBlocks(materialId, indexed, outcomes);
  }

  // El título de una página web es el de la página, salvo que hayas puesto uno vos.
  function retitle(materialId: string, title: string): void {
    const row = store().row(materialId);
    const fallback = row.sourceUrl
      ? titleFromAddress(row.sourceUrl)
      : titleFromName(row.originalName);
    if (title.trim() !== '' && row.title === fallback) {
      store().setTitle(materialId, title.trim().slice(0, 200));
    }
  }

  async function runStage(item: QueueItem): Promise<void> {
    const row = store().row(item.materialId);
    const meta = formatTool(item.kind);
    switch (item.stage) {
      case 'validate': {
        const declaredWord = /\.docx$/i.test(row.originalName);
        const params = { format: item.kind, declaredWord, pipeline: PIPELINE_VERSION };
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
        // Una página que se pidió reconocer (o leer de nuevo) lleva su vuelta en la clave, así no
        // reusa lo guardado. Sin eso (la primera lectura) la clave es la de siempre.
        const unitRow =
          item.kind === 'pdf' ? store().unit(item.materialId, item.unitNo) : undefined;
        const ocr = unitRow?.textSource === 'ocr';
        const generation = unitRow?.generation ?? 0;
        const params =
          generation === 0 && !ocr
            ? { format: item.kind, pipeline: PIPELINE_VERSION }
            : { format: item.kind, pipeline: PIPELINE_VERSION, generation, ocr };
        const extractMeta = ocr ? TOOLS.ocr : meta;
        const limit = ocr ? limits.ocr : item.kind === 'pdf' ? limits.extract : limits.document;
        const { key, output } = await cachedOr(
          item,
          'extract',
          item.unitNo,
          extractMeta,
          params,
          () =>
            run(
              {
                kind: 'extract',
                format: item.kind,
                file: fileOf(item),
                unit: item.unitNo,
                ...(ocr ? { ocr: true, workDir: dirs().tmpDir } : {}),
              },
              limit,
            ),
        );
        const parsed = extractResult.parse(output);
        if ('unreadable' in parsed) {
          store().failValidation(item.id, 'webEmpty');
          safeEmit({ type: 'material.failed', materialId: item.materialId });
          finished = true;
          return;
        }
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
        // Una página de PDF con muy poco texto para su tamaño cuenta como «No extraído»: es
        // lo que pasa con un escaneo (con un sello o un número suelto).
        const hasText =
          item.kind === 'pdf'
            ? textLayer({
                chars,
                width: unitRow?.width ?? null,
                height: unitRow?.height ?? null,
              }) === 'ok'
            : chars > 0;
        store().completeExtract(
          item.id,
          { key, output: parsed, ...extractMeta, params },
          {
            status: hasText ? 'ready' : 'no_text',
            chars,
            paragraphs,
            textSource: ocr ? 'ocr' : 'pdf',
            ocrConfidence: parsed.format === 'pdf' ? (parsed.page.ocr?.confidence ?? null) : null,
          },
        );
        if (parsed.format === 'web') {
          retitle(item.materialId, parsed.snapshot.title);
        }
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
        const params = { inputs: keys, outline: outline.length, pipeline: PIPELINE_VERSION };
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
              entry.format === 'pdf' || !('drafts' in entry) ? [] : entry.drafts,
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
        const params = { input: structure.key, pipeline: PIPELINE_VERSION };
        const { key, output } = await cachedOr(item, 'normalize', 0, TOOLS.normalize, params, () =>
          run({ kind: 'normalize', drafts }, limits.document + 500 * (row.unitCount ?? 1)),
        );
        const parsed = normalizeResult.parse(output);
        store().completeStage(item.id, { key, output: parsed, ...TOOLS.normalize, params });
        return;
      }
      case 'index': {
        const { indexed, outcomes } = indexedBlocksOf(item.materialId, item.kind);
        store().completeIndex(item.id, indexed, outcomes);
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
        try {
          store().release(task.id);
        } catch {
          // La base se está reemplazando: al abrir de nuevo, la tarea vuelve sola a «pendiente».
        }
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
      if (!net.isOffline()) {
        beginPending();
      }
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
      ...(received.kind === 'web' ? { snapshotAt: clock.now().toISOString() } : {}),
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
    // Si la selección termina en un bloque de otra unidad (un párrafo que sigue en la página de al
    // lado, o algo que no tiene texto), la cita llega hasta el final del bloque donde empezó: nunca
    // se mezclan desplazamientos de dos bloques distintos.
    const toBlock = unit.blocks.find((block) => block.id === selection.to.blockId);
    let start = Math.min(fromBlock.start + selection.from.offset, fromBlock.end);
    let end = toBlock ? Math.min(toBlock.start + selection.to.offset, toBlock.end) : fromBlock.end;
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
    // La página que se nombra es donde empieza la frase en la hoja: un párrafo que sigue en la
    // página de al lado se guarda con la primera, pero su final está en la otra.
    const reference = referenceOf(row.title, kind, boxes[0]?.page ?? unit.unit, headingPath);
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

  const reviewInput = (materialId: string) => ({
    materialKind: store().row(materialId).kind,
    units: store().units(materialId),
    blocks: store().blocks(materialId),
    corrections: store().corrections(materialId),
    resolutions: store().resolutions(materialId),
  });

  const reviewOf = (materialId: string): MaterialReview => {
    const row = store().row(materialId);
    const summary = store().summary(materialId);
    return buildReview({
      materialId,
      title: row.title,
      kind: (row.kind ?? 'text') as MaterialReview['kind'],
      summary,
      working: isWorkingState(summary.state),
      ...reviewInput(materialId),
    });
  };

  // La cita de una tarjeta puesta al día con el texto corregido de su bloque: la frase se mueve
  // junto con lo que cambió y se vuelve a ubicar en el texto de ahora.
  const movedCite = (
    materialId: string,
    stored: StoredCite,
    before: string,
    after: string,
  ): StoredCite | null => {
    let quote = after.slice(0, 300);
    const at = before.indexOf(stored.quote);
    if (at >= 0) {
      const moved = remapQuote(before, after, at, at + stored.quote.length);
      const part = after.slice(moved.start, moved.end).trim();
      if (part !== '') {
        quote = part;
      }
    }
    const texts = store().unitTexts(materialId);
    const located = relocateQuote(texts, {
      unit: stored.locator.page,
      quote,
      before: '',
      after: '',
    });
    if (located.status !== 'located') {
      return null;
    }
    const entry = texts.find((candidate) => candidate.unit === located.unit);
    if (!entry) {
      return null;
    }
    const context = quoteContext(entry.text, located.start, located.end);
    return {
      ...stored,
      locator: {
        ...stored.locator,
        page: located.unit,
        boxes: boxesFor(entry.spans, located.start, located.end),
        quote,
        before: context.before,
        after: context.after,
      },
      quote,
    };
  };

  // Al deshacer una corrección: las tarjetas que se habían actualizado a su texto vuelven al texto
  // que quedó (las que no se actualizaron todavía se encuentran, y no se tocan).
  const revertCites = (materialId: string, from: string, to: string): void => {
    const texts = store().unitTexts(materialId);
    for (const { cardId, sourceCite } of workspace.cards.citing(materialId)) {
      const stored = parseCite(sourceCite);
      if (!stored || stored.materialId !== materialId || !from.includes(stored.quote)) {
        continue;
      }
      const located = relocateQuote(texts, {
        unit: stored.locator.page,
        quote: stored.quote,
        before: stored.locator.before,
        after: stored.locator.after,
      });
      if (located.status === 'located') {
        continue;
      }
      const next = movedCite(materialId, stored, from, to);
      if (next) {
        workspace.cards.updateSource({ cardId, sourceCite: JSON.stringify(next) });
      }
    }
  };

  // Páginas web: la descarga la hace el proceso principal. Sin conexión (o si falla la red) la
  // página queda pendiente y se vuelve a intentar cuando haya conexión.
  const downloading = new Set<string>();
  const downloads = new Set<Promise<void>>();

  async function download(materialId: string): Promise<void> {
    let address: string | null;
    try {
      const row = store().row(materialId);
      address = row.pendingNetwork === 1 ? row.sourceUrl : null;
    } catch {
      return;
    }
    if (address === null) {
      return;
    }
    const result = await downloadPage(address, net);
    if (abandoned || (!result.ok && 'pending' in result)) {
      return;
    }
    try {
      store().row(materialId);
    } catch {
      // Lo quitaste de la lista mientras se bajaba.
      return;
    }
    if (!result.ok) {
      store().failMaterial(materialId, result.problem);
      safeEmit({ type: 'material.failed', materialId });
      return;
    }
    const document = /^\s*<(!doctype\s+html|html[\s>])/iu.test(result.html)
      ? result.html
      : `<!doctype html>\n${result.html}`;
    const received = await receiveText(document, `${new URL(address).host}.html`, dirs());
    if (!received.ok || received.kind !== 'web') {
      store().failMaterial(materialId, received.ok ? 'webNotPage' : received.problem);
      safeEmit({ type: 'material.failed', materialId });
      return;
    }
    store().attachDownload(materialId, {
      sha256: received.sha256,
      ext: received.ext,
      sizeBytes: received.size,
      snapshotAt: clock.now().toISOString(),
    });
    safeEmit({ type: 'material.progress', materialId });
    kick();
  }

  function beginDownload(materialId: string): void {
    if (downloading.has(materialId) || abandoned) {
      return;
    }
    downloading.add(materialId);
    const job: Promise<void> = download(materialId)
      .catch((error: unknown) => {
        console.error('Retenia: no se pudo bajar una página web', error);
      })
      .finally(() => {
        downloading.delete(materialId);
        downloads.delete(job);
      });
    downloads.add(job);
  }

  const stopWatchingNet = net.onChange((offline) => {
    if (!offline && started) {
      beginPending();
    }
  });
  const webTimer = setInterval(() => {
    if (started && !abandoned && !net.isOffline()) {
      beginPending();
    }
  }, 30_000);
  webTimer.unref?.();

  function beginPending(): void {
    try {
      for (const entry of store().pendingWeb()) {
        beginDownload(entry.id);
      }
    } catch {
      // La base no está disponible ahora: la próxima vuelta lo intenta de nuevo.
    }
  }

  const service: MaterialsService = {
    async addUrl({ subjectId, address, title }) {
      const parsed = parseWebAddress(address);
      if (!parsed.ok) {
        throw new Error('La dirección no es una dirección web');
      }
      const materialId = store().create({
        subjectId,
        title: title?.trim() || titleFromAddress(parsed.url),
        kind: 'web',
        originalSha256: null,
        originalName: parsed.url,
        originalExt: null,
        sizeBytes: 0,
        errorCode: null,
        sourceUrl: parsed.url,
        pendingNetwork: true,
      });
      safeEmit({ type: 'material.progress', materialId });
      beginDownload(materialId);
      return { outcome: 'added', materialId };
    },

    snapshot({ materialId }) {
      const row = store().row(materialId);
      const [extract] = store().stageOutputs(materialId, 'extract');
      const parsed = extract ? extractResult.safeParse(extract.output) : null;
      if (!parsed?.success || parsed.data.format !== 'web' || !('snapshot' in parsed.data)) {
        throw new Error('Este material no tiene una instantánea');
      }
      return {
        html: parsed.data.snapshot.html,
        address: row.sourceUrl,
        savedDay: localDateTime(new Date(row.snapshotAt ?? row.addedAt)).day,
      };
    },

    review: ({ materialId }) => reviewOf(materialId),

    ocrPage({ materialId, unit }) {
      if (store().row(materialId).kind !== 'pdf' || !store().unit(materialId, unit)) {
        throw new Error('Esa página no existe');
      }
      store().requestExtract(materialId, unit, true);
      safeEmit({ type: 'material.progress', materialId });
      kick();
      return {};
    },

    reprocessPage({ materialId, unit }) {
      const unitRow = store().unit(materialId, unit);
      if (!unitRow) {
        throw new Error('Esa página no existe');
      }
      store().requestExtract(materialId, unit, unitRow.textSource === 'ocr');
      safeEmit({ type: 'material.progress', materialId });
      kick();
      return {};
    },

    excludePages({ materialId, units, excluded }) {
      store().setExcluded(materialId, units, excluded);
      return reviewOf(materialId);
    },

    resolveProblem({ materialId, problemId, resolution }) {
      const separator = problemId.indexOf(':');
      const unit = Number(problemId.slice(0, separator));
      const key = problemId.slice(separator + 1);
      if (separator < 1 || !Number.isInteger(unit) || key === '') {
        throw new Error('Ese problema no existe');
      }
      if (resolution === null) {
        const correction = store()
          .corrections(materialId)
          .find((row) => row.unitNo === unit && row.blockKey === key);
        if (correction) {
          store().dropCorrection(correction.id);
          rebuildBlocks(materialId);
          // Las tarjetas que ya se habían actualizado vuelven al texto de base.
          revertCites(materialId, correction.afterText, correction.beforeText);
        }
      }
      store().setResolution(materialId, unit, key, resolution);
      return reviewOf(materialId);
    },

    correctText({ materialId, blockId, text }) {
      const clean = text.replace(/\r\n?/gu, '\n').trim();
      if (clean === '') {
        throw new Error('El texto corregido está vacío');
      }
      const block = infosOf(store().blocks(materialId)).find((info) => info.id === blockId);
      if (!block) {
        throw new Error('El bloque no es de este material');
      }
      // Las tarjetas que usan este texto, antes de que el texto cambie.
      const cards = [
        ...new Map(
          citesOf(materialId)
            .filter((entry) => entry.blockId === block.id)
            .map(({ cardId, question }) => [cardId, { cardId, question }] as const),
        ).values(),
      ];
      const correctionId = store().saveCorrection({
        materialId,
        unit: block.unit,
        key: block.key,
        before: block.base,
        previous: block.current,
        after: clean,
        pendingCards: cards.map((card) => card.cardId),
      });
      rebuildBlocks(materialId);
      safeEmit({ type: 'material.progress', materialId });
      return { correctionId, cards };
    },

    updateDerived({ correctionId, update }) {
      const correction = store().correction(correctionId);
      if (!correction) {
        throw new Error('Esa corrección no existe');
      }
      if (!update) {
        return { updated: 0 };
      }
      let updated = 0;
      const remaining: string[] = [];
      for (const cardId of JSON.parse(correction.pendingCards) as string[]) {
        const stored = storedCiteOf(cardId);
        if (!stored || stored.materialId !== correction.materialId) {
          continue;
        }
        const next = movedCite(
          correction.materialId,
          stored,
          correction.previousText ?? correction.beforeText,
          correction.afterText,
        );
        if (next) {
          workspace.cards.updateSource({ cardId, sourceCite: JSON.stringify(next) });
          updated++;
        } else {
          // Todavía no se puede mover (la página se está volviendo a leer): sigue pendiente.
          remaining.push(cardId);
        }
      }
      store().setPendingCards(correctionId, remaining);
      return { updated };
    },

    resolveConflict({ correctionId, keep }) {
      const correction = store().correction(correctionId);
      if (!correction) {
        throw new Error('Esa corrección no existe');
      }
      const { materialId } = correction;
      const here = infosOf(store().blocks(materialId)).filter(
        (info) =>
          info.unit === correction.unitNo &&
          ['paragraph', 'list', 'table', 'formula', 'code'].includes(info.type),
      );
      const candidate = closestBlock(correction.beforeText, here);
      if (keep) {
        if (candidate) {
          store().keepCorrection(correctionId, { key: candidate.key, before: candidate.base });
        }
      } else {
        store().dropCorrection(correctionId);
      }
      rebuildBlocks(materialId);
      if (!keep && candidate) {
        revertCites(materialId, correction.afterText, candidate.base);
      }
      return reviewOf(materialId);
    },

    sourceChange: ({ cardId }) => ({ changed: store().cardsWithPendingChange(cardId) }),

    offerableBlockIds: ({ materialId }) => offerableBlocks(reviewInput(materialId)),

    async resumePending() {
      beginPending();
      await Promise.all([...downloads]);
    },

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
      const name = title?.trim() || firstLine(text) || catalog.materials.untitledText;
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
        // Un original recién guardado para esta decisión (mismo nombre, otro contenido) que nadie
        // usa no se guarda. Uno que ya estaba de antes (de un material quitado, o que otra copia
        // nombra) se deja.
        if (
          received.fresh &&
          received.sha256 !== existing.originalSha256 &&
          !store().findByHash(received.sha256)
        ) {
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
        excluded: unitRow?.excluded === 1,
        textSource: (unitRow?.textSource ?? 'pdf') as MaterialPage['textSource'],
        working: isWorkingState(store().summary(materialId).state),
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
        const highlight = entry ? boxesFor(entry.spans, located.start, located.end) : [];
        return {
          materialId,
          // Se abre la página donde empieza la frase en la hoja.
          unit: highlight[0]?.page ?? located.unit,
          blockId: block?.id ?? null,
          highlight,
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

    preview({ materialId, selection }) {
      const { reference, quote } = citeOf(materialId, selection);
      return { reference, quote };
    },

    fragment({ materialId, selection }) {
      const { row, quote } = citeOf(materialId, selection);
      return { text: quote, title: row.title };
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
        if (downloads.size > 0) {
          await Promise.all([...downloads]);
          continue;
        }
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
      pauses++;
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
      pauses = Math.max(0, pauses - 1);
      if (pauses > 0) {
        return;
      }
      paused = false;
      kick();
    },

    async stop() {
      started = false;
      clearInterval(staleTimer);
      clearInterval(webTimer);
      stopWatchingNet();
      if (running) {
        await running.catch(() => undefined);
      }
    },

    abandon() {
      abandoned = true;
      started = false;
      clearInterval(staleTimer);
      clearInterval(webTimer);
      stopWatchingNet();
    },
  };
  if (autoStart) {
    start();
  }
  return service;
}
