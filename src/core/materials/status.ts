import type { TaskStatus } from './queue';

// El estado de un material y sus etapas (H-25, CA-104), calculados a partir de sus tareas y sus
// unidades: nunca se guardan por separado, así no se pueden contradecir.

export type Stage = 'validate' | 'extract' | 'structure' | 'normalize' | 'index';

export type UnitStatus = 'pending' | 'ready' | 'no_text' | 'review';

export type ErrorProblem =
  | 'empty'
  | 'unsupported'
  | 'notPdf'
  | 'notWord'
  | 'tooLarge'
  | 'copyFailed'
  | 'pdfUnreadable'
  | 'wordUnreadable'
  | 'textUnreadable'
  | 'webBlocked'
  | 'webNotPage'
  | 'webEmpty'
  | 'webUnreachable';

export type MaterialState =
  | { kind: 'received'; cancelled?: true }
  | { kind: 'processing'; read: number; total: number }
  | { kind: 'ready' }
  | { kind: 'partial'; read: number; total: number; cancelled?: true }
  | { kind: 'review' }
  | { kind: 'error'; problem: ErrorProblem }
  // `localOnly`: espera porque está prendido «Modo solo local» (Fase 19), no por falta de red.
  | { kind: 'pendingNetwork'; localOnly?: true };

export interface StatusInput {
  errorCode: string | null;
  // Una página web que espera a que haya conexión para bajarse (H-28).
  pendingNetwork?: boolean;
  // «Modo solo local» prendido (Fase 19): nada sale de la PC.
  localOnly?: boolean;
  unitCount: number | null;
  units: readonly { status: UnitStatus }[];
  tasks: readonly { stage: Stage; status: TaskStatus }[];
}

const isRead = (status: UnitStatus) => status === 'ready' || status === 'no_text';

export function materialState({
  errorCode,
  pendingNetwork = false,
  localOnly = false,
  unitCount,
  units,
  tasks,
}: StatusInput): MaterialState {
  if (errorCode !== null) {
    return { kind: 'error', problem: errorCode as ErrorProblem };
  }
  if (pendingNetwork) {
    return localOnly ? { kind: 'pendingNetwork', localOnly: true } : { kind: 'pendingNetwork' };
  }
  const read = units.filter((unit) => isRead(unit.status)).length;
  const total = unitCount ?? units.length;
  const active = tasks.filter((task) => task.status === 'pending' || task.status === 'running');
  if (active.length > 0) {
    const started = tasks.some((task) => task.status !== 'pending');
    return started ? { kind: 'processing', read, total } : { kind: 'received' };
  }
  const cancelled = tasks.some((task) => task.status === 'cancelled');
  if (cancelled) {
    return read > 0
      ? { kind: 'partial', read, total, cancelled: true }
      : { kind: 'received', cancelled: true };
  }
  const indexed = tasks.some((task) => task.stage === 'index' && task.status === 'done');
  const review = units.filter((unit) => unit.status === 'review').length;
  if (!indexed) {
    return read > 0 ? { kind: 'partial', read, total } : { kind: 'review' };
  }
  if (review > 0) {
    return read > 0 ? { kind: 'partial', read, total } : { kind: 'review' };
  }
  return { kind: 'ready' };
}

type StageStatus = 'done' | 'current' | 'pending';

export type StageView =
  | { id: 'saved' | 'sections' | 'ready'; status: StageStatus }
  | { id: 'extracted'; status: StageStatus; withText: number; total: number }
  | { id: 'extracted'; status: StageStatus; paragraphs: number };

export interface StageInput {
  kind: 'pdf' | 'docx' | 'md' | 'text' | 'web';
  unitCount: number | null;
  units: readonly { status: UnitStatus; chars: number }[];
  // Cuántos bloques con texto hay (lo que se cuenta como «párrafos» fuera de un PDF).
  paragraphs: number;
  tasks: readonly { stage: Stage; status: TaskStatus }[];
}

const finished = (status: TaskStatus) =>
  status === 'done' || status === 'review' || status === 'failed';

// Una etapa está «en curso» solo si la anterior terminó y el material tiene algo corriendo o por
// correr: un material en «Requiere revisión», cancelado o con una etapa fallida no muestra nada
// girando.
function statusOf(
  tasks: StageInput['tasks'],
  stages: readonly Stage[],
  previousDone: boolean,
): StageStatus {
  const own = tasks.filter((task) => stages.includes(task.stage));
  const expected = stages.every((stage) => own.some((task) => task.stage === stage));
  if (expected && own.every((task) => finished(task.status))) {
    return 'done';
  }
  const active =
    tasks.length === 0 ||
    tasks.some((task) => task.status === 'pending' || task.status === 'running');
  return previousDone && active ? 'current' : 'pending';
}

// Las cuatro etapas que se ven: «Archivo guardado» (validar), «Texto extraído» (extraer, con su
// conteo), «Secciones detectadas» (estructura y normalización) y «Listo» (indexar).
export function stageView({ kind, unitCount, units, paragraphs, tasks }: StageInput): StageView[] {
  const saved = statusOf(tasks, ['validate'], true);
  const extracted = statusOf(tasks, ['extract'], saved === 'done');
  const sections = statusOf(tasks, ['structure', 'normalize'], extracted === 'done');
  const ready = statusOf(tasks, ['index'], sections === 'done');
  const counts =
    kind === 'pdf'
      ? {
          withText: units.filter((unit) => unit.status === 'ready' && unit.chars > 0).length,
          total: unitCount ?? units.length,
        }
      : { paragraphs };
  return [
    { id: 'saved', status: saved },
    { id: 'extracted', status: extracted, ...counts } as StageView,
    { id: 'sections', status: sections },
    { id: 'ready', status: ready },
  ];
}
