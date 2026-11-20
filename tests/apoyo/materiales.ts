import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Stopwatch } from '../../src/core/clock';
import { createMaterialsService, type MaterialsService } from '../../src/main/materials/service';
import { runMaterialsTask } from '../../src/main/workers/materials-tasks';
import type { MaterialsTask } from '../../src/main/workers/protocol';
import type { Space } from './espacio';

// Los materiales sobre una carpeta de datos real. El proceso de trabajo corre en el mismo proceso
// de la prueba: es el mismo código que corre en `materials-worker` (src/main/workers), sin
// Electron en el medio. Las pruebas que necesitan un proceso que falla o se cuelga usan su propio
// ejecutor (simulado), declarado en docs/plan-de-pruebas.md.

export const SAMPLES = resolve(import.meta.dirname, '..', '..', 'datos-de-ejemplo');
export const INFERENCE = 'Inferencia — capítulos 1 a 4.pdf';

export const sample = (name: string) => join(SAMPLES, name);

const extraFolders: string[] = [];

// Una copia de un archivo de ejemplo con otro nombre, en una carpeta temporal propia.
export function copySample(name: string, as: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'retenia-material-'));
  extraFolders.push(folder);
  const target = join(folder, as);
  copyFileSync(sample(name), target);
  return target;
}

export function tempFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), 'retenia-material-'));
  extraFolders.push(folder);
  return folder;
}

export function removeTempFolders(): void {
  for (const folder of extraFolders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
}

export interface OpenMaterials {
  service: MaterialsService;
  // Qué tareas llegaron al proceso de trabajo, en orden («extract:3»).
  executed: string[];
  events: unknown[];
}

const taskLabel = (task: MaterialsTask) =>
  'unit' in task ? `${task.kind}:${String(task.unit)}` : task.kind;

export function openMaterials(
  space: Space,
  {
    execute,
    runnerId,
    timeouts,
    stopwatch,
    interrupt,
  }: {
    execute?: (task: MaterialsTask) => Promise<unknown>;
    runnerId?: string;
    timeouts?: Partial<Record<'validate' | 'extract' | 'document', number>>;
    stopwatch?: Stopwatch;
    // Cómo se corta la tarea en curso (en Retenia, el supervisor corta el proceso de trabajo).
    interrupt?: () => void;
  } = {},
): OpenMaterials {
  const executed: string[] = [];
  const events: unknown[] = [];
  const service = createMaterialsService({
    workspace: space.workspace,
    clock: space.clock,
    execute: async (task) => {
      executed.push(taskLabel(task));
      return execute ? execute(task) : runMaterialsTask(task);
    },
    emit: (event) => events.push(event),
    ...(runnerId ? { runnerId } : {}),
    ...(timeouts ? { timeouts } : {}),
    ...(stopwatch ? { stopwatch } : {}),
    ...(interrupt ? { interrupt } : {}),
  });
  return { service, executed, events };
}

// La materia activa de la prueba.
export function statisticsSubject(space: Space): string {
  return space.workspace.subjects.create({ name: 'Estadística básica', makeActive: true }).id;
}
