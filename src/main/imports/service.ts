import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Clock } from '../../core/clock';
import {
  EXPORT_FORMAT_VERSION,
  type ExportIndex,
  exportIndexSchema,
} from '../../core/imports/markdown';
import { type ImportPackage, importPackageSchema } from '../../core/imports/package';
import { localDateTime } from '../../core/study-day';
import { newId } from '../../data/ids';
import type { ImportDestination, ImportRecord } from '../../data/imports';
import { migrationIds } from '../../data/migrations';
import type { Workspace } from '../../data/workspace';
import type {
  ExportCountsView,
  ExportProblem,
  ImportKindValue,
  ImportPreview,
  ImportProblem,
  ImportRecordView,
  ImportResult,
} from '../../preload/contract/imports';
import { formatShortDate, texts } from '../../preload/contract/texts';

// Importar de Anki y de RemNote, «Exportar todo» e «Importar exportación» (H-29, H-30), del lado del
// proceso principal. Los archivos ajenos los lee el proceso aislado («transfers»: sin red, con topes);
// acá se vuelve a validar lo que devuelve, se arma la vista previa (sin escribir nada) y, con
// «Importar», se hace la copia «Antes de importar» y se escribe todo en una sola transacción.

export type PreviewOutcome =
  | { outcome: 'preview'; preview: ImportPreview }
  | { outcome: 'problem'; problem: ImportProblem };

export type ExportPreviewOutcome =
  | { outcome: 'preview'; previewId: string; counts: ExportCountsView; exportedAt: string }
  | { outcome: 'problem'; problem: ExportProblem };

export interface TransfersService {
  preview(input: { kind: ImportKindValue; path: string }): Promise<PreviewOutcome>;
  run(input: { previewId: string; destination: ImportDestination }): Promise<ImportResult>;
  cancel(previewId: string): void;
  list(): ImportRecordView[];
  // «Guardar lista»: lo rechazado de una importación, en texto.
  rejectedList(importId: string): string;
  exportAll(input: { file: string }): Promise<{ file: string; counts: ExportCountsView }>;
  previewExport(input: { path: string }): Promise<ExportPreviewOutcome>;
  loadExport(input: { previewId: string }): Promise<{ counts: ExportCountsView }>;
  isEmpty(): boolean;
}

export class PreviewExpiredError extends Error {
  constructor() {
    super('La vista previa ya no está: elegí el archivo otra vez');
    this.name = 'PreviewExpiredError';
  }
}

export class NotEmptyError extends Error {
  constructor() {
    super('Retenia ya tiene datos: una exportación se carga en un Retenia vacío');
    this.name = 'NotEmptyError';
  }
}

interface PendingImport {
  kind: ImportKindValue;
  pkg: ImportPackage;
  fileSha256: string;
  fileName: string;
  folder: string;
}

interface PendingExport {
  folder: string;
  index: ExportIndex;
}

type ReadResult =
  | { ok: true; package: unknown; fileSha256: string; fileName: string }
  | { ok: false; problem: string };

const IMPORT_PROBLEMS: readonly ImportProblem[] = [
  'notAnki',
  'notRemnote',
  'tooNew',
  'damaged',
  'unsafe',
];
const EXPORT_PROBLEMS: readonly ExportProblem[] = ['notExport', 'damaged', 'tooNew', 'unsafe'];
const MAX_PENDING = 3;

export function createTransfersService({
  workspace,
  execute,
  limits,
}: {
  workspace: Workspace;
  // El reloj de Retenia (las fechas de lo importado las pone la base con el suyo).
  clock?: Clock;
  // Corre una tarea en el proceso aislado (en las pruebas, en el mismo proceso).
  execute: (task: unknown) => Promise<unknown>;
  limits?: { maxBytes: number };
}): TransfersService {
  const pending = new Map<string, PendingImport>();
  const pendingExports = new Map<string, PendingExport>();
  const workFolder = (name: string) => {
    const folder = join(workspace.dataDir, 'tmp', `${name}-${newId()}`);
    mkdirSync(folder, { recursive: true });
    return folder;
  };
  const remove = (folder: string) => {
    try {
      rmSync(folder, { recursive: true, force: true });
    } catch {
      // Queda en «tmp»: se limpia al abrir Retenia.
    }
  };
  const keepFew = <T extends { folder: string }>(map: Map<string, T>) => {
    while (map.size > MAX_PENDING) {
      const [oldest] = map.keys();
      if (oldest === undefined) {
        break;
      }
      const item = map.get(oldest);
      map.delete(oldest);
      if (item) {
        remove(item.folder);
      }
    }
  };
  const toView = (record: ImportRecord): ImportRecordView => ({
    importId: record.importId,
    kind: record.kind,
    fileName: record.fileName,
    at: record.at,
    subjectName: record.subjectName,
    counts: {
      cards: record.plan.cards,
      notes: record.plan.notes,
      reviews: record.plan.reviews,
      withoutHistory: record.plan.withoutHistory,
      rejected: record.plan.rejected.length,
    },
    rejected: record.plan.rejected,
    annotated: record.plan.annotated,
  });
  const limitsTask = limits ? { limits: { maxBytes: limits.maxBytes } } : {};

  return {
    async preview({ kind, path }) {
      const folder = workFolder('importar');
      let result: ReadResult;
      try {
        result = (await execute({
          kind: kind === 'anki' ? 'readAnki' : 'readRemnote',
          path,
          outDir: folder,
          ...limitsTask,
        })) as ReadResult;
      } catch (error) {
        remove(folder);
        throw error;
      }
      if (!result.ok) {
        remove(folder);
        const problem = IMPORT_PROBLEMS.find((item) => item === result.problem) ?? 'damaged';
        return { outcome: 'problem', problem };
      }
      const parsed = importPackageSchema.safeParse(result.package);
      if (!parsed.success || parsed.data.kind !== kind) {
        remove(folder);
        return { outcome: 'problem', problem: 'damaged' };
      }
      const pkg = parsed.data;
      const plan = workspace.imports.plan(pkg);
      const previewId = newId();
      pending.set(previewId, {
        kind,
        pkg,
        fileSha256: result.fileSha256,
        fileName: result.fileName,
        folder,
      });
      keepFew(pending);
      return {
        outcome: 'preview',
        preview: {
          previewId,
          kind,
          fileName: result.fileName,
          counts: {
            cards: plan.cards,
            notes: plan.notes,
            reviews: plan.reviews,
            withoutHistory: plan.withoutHistory,
            rejected: plan.rejected.length,
          },
          rejected: plan.rejected,
          annotated: plan.annotated,
          importedBefore: workspace.imports.importedBefore(result.fileSha256),
        },
      };
    },

    async run({ previewId, destination }) {
      const item = pending.get(previewId);
      if (!item) {
        throw new PreviewExpiredError();
      }
      // Primero, sí o sí, la copia «Antes de importar». Si no se puede, no se importa nada.
      const backup = await workspace.createBackup('before_import');
      // Si algo falla, la vista previa sigue: se puede volver a intentar.
      const record = workspace.imports.apply({
        pkg: item.pkg,
        fileName: item.fileName,
        fileSha256: item.fileSha256,
        destination,
        mediaDir: join(item.folder, 'medios'),
      });
      pending.delete(previewId);
      remove(item.folder);
      const view = toView(record);
      return {
        importId: record.importId,
        subjectId: record.subjectId,
        subjectName: record.subjectName,
        counts: view.counts,
        backupId: backup.id,
      };
    },

    cancel(previewId) {
      const item = pending.get(previewId);
      if (item) {
        pending.delete(previewId);
        remove(item.folder);
      }
      const loading = pendingExports.get(previewId);
      if (loading) {
        pendingExports.delete(previewId);
        remove(loading.folder);
      }
    },

    list: () => workspace.imports.list().map(toView),

    rejectedList(importId) {
      const record = workspace.imports.get(importId);
      const { day } = localDateTime(new Date(record.at));
      const lines = [
        texts.imports.rejectedHeader(record.fileName, formatShortDate(day)),
        '',
        ...record.plan.rejected.map((item) =>
          texts.imports.rejectedLine(item.what, texts.imports.reasons[item.reason]),
        ),
        '',
      ];
      return lines.join('\r\n');
    },

    async exportAll({ file }) {
      const staging = workFolder('exportar');
      const partial = join(dirname(file), `.${newId()}.retenia-exportacion.tmp`);
      try {
        const staged = workspace.stageExport(staging);
        await execute({ kind: 'writeZip', entries: staged.entries, out: partial });
        rmSync(file, { force: true });
        renameSync(partial, file);
        return { file, counts: staged.index.counts };
      } finally {
        rmSync(partial, { force: true });
        remove(staging);
      }
    },

    async previewExport({ path }) {
      if (!workspace.isEmpty()) {
        return { outcome: 'problem', problem: 'notEmpty' };
      }
      const folder = workFolder('cargar');
      const result = (await execute({ kind: 'readExport', path, outDir: folder, ...limitsTask })) as
        | { ok: true; index: unknown }
        | { ok: false; problem: string };
      if (!result.ok) {
        remove(folder);
        return {
          outcome: 'problem',
          problem: EXPORT_PROBLEMS.find((item) => item === result.problem) ?? 'damaged',
        };
      }
      const parsed = exportIndexSchema.safeParse(result.index);
      if (!parsed.success) {
        remove(folder);
        return { outcome: 'problem', problem: 'notExport' };
      }
      const known = new Set(migrationIds());
      if (
        parsed.data.formatVersion > EXPORT_FORMAT_VERSION ||
        parsed.data.migrations.some((migration) => !known.has(migration))
      ) {
        remove(folder);
        return { outcome: 'problem', problem: 'tooNew' };
      }
      const previewId = newId();
      pendingExports.set(previewId, { folder, index: parsed.data });
      keepFew(pendingExports);
      return {
        outcome: 'preview',
        previewId,
        counts: parsed.data.counts,
        exportedAt: parsed.data.exportedAt,
      };
    },

    async loadExport({ previewId }) {
      const item = pendingExports.get(previewId);
      if (!item) {
        throw new PreviewExpiredError();
      }
      if (!workspace.isEmpty()) {
        throw new NotEmptyError();
      }
      await workspace.createBackup('before_import');
      const counts = workspace.loadExport({ staging: item.folder, index: item.index });
      pendingExports.delete(previewId);
      remove(item.folder);
      return { counts };
    },

    isEmpty: () => workspace.isEmpty(),
  };
}
