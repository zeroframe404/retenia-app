import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type Clock, demoClock, type Stopwatch } from '../../src/core/clock';
import { openWorkspace, type Workspace } from '../../src/data/workspace';
import { createMaterialsService, type MaterialsService } from '../../src/main/materials/service';
import type { NetGate } from '../../src/main/net-gate';
import { runMaterialsTask } from '../../src/main/workers/materials-tasks';
import type { MaterialsTask } from '../../src/main/workers/protocol';
import { tempDataFolder } from './base';
import type { Space } from './espacio';
import { sharedTemplateAsync } from './plantillas';

// Los materiales sobre una carpeta de datos real. El proceso de trabajo corre en el mismo proceso
// de la prueba: es el mismo código que corre en `materials-worker` (src/main/workers), sin
// Electron en el medio. Las pruebas que necesitan un proceso que falla o se cuelga usan su propio
// ejecutor (simulado), declarado en docs/plan-de-pruebas.md.

const SAMPLES = resolve(import.meta.dirname, '..', '..', 'datos-de-ejemplo');
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
    net,
  }: {
    execute?: (task: MaterialsTask) => Promise<unknown>;
    runnerId?: string;
    timeouts?: Partial<Record<'validate' | 'extract' | 'document' | 'ocr', number>>;
    stopwatch?: Stopwatch;
    // Cómo se corta la tarea en curso (en Retenia, el supervisor corta el proceso de trabajo).
    interrupt?: () => void;
    // La puerta hacia internet (Fase 14): por defecto, la real; las pruebas de páginas web la reemplazan.
    net?: NetGate;
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
    ...(net ? { net } : {}),
  });
  return { service, executed, events };
}

// La materia activa de la prueba.
export function statisticsSubject(space: Space): string {
  return space.workspace.subjects.create({ name: 'Estadística básica', makeActive: true }).id;
}

// Una carpeta de datos con «Estadística básica» activa y el PDF de inferencia agregado y leído
// hasta el final, como la deja `statisticsSubject` + `openMaterials` + agregar el PDF y esperar
// (con el reloj de la demostración, como `openSpace`). Leer el PDF tarda casi medio segundo: las
// pruebas que solo lo necesitan como punto de partida arrancan con una copia
// (`openSpace({ copyOf })`) de la que se lee una sola vez por corrida (tests/apoyo/plantillas.ts).
// Es la misma lectura, hecha por el mismo código. Las que miran la lectura misma (qué tareas
// corrieron, los avisos) siguen agregando el PDF en la prueba.
let inferenceFolder: Promise<string> | null = null;

export function readInferenceFolder(): Promise<string> {
  inferenceFolder ??= sharedTemplateAsync('inferencia-leida', async () => {
    const data = tempDataFolder();
    const clock = demoClock();
    const workspace = openWorkspace({ dataDir: data.folder, clock, appVersion: '0.0.0-prueba' });
    try {
      const subjectId = workspace.subjects.create({
        name: 'Estadística básica',
        makeActive: true,
      }).id;
      const service = createMaterialsService({
        workspace,
        clock,
        execute: (task) => runMaterialsTask(task),
      });
      const { results } = await service.addFiles({ paths: [sample(INFERENCE)], subjectId });
      if (results[0]?.outcome !== 'added') {
        throw new Error('no se agregó');
      }
      await service.whenIdle();
      await service.stop();
    } finally {
      workspace.close();
    }
    return { folder: data.folder, remove: data.remove };
  });
  return inferenceFolder;
}

// El material de una carpeta que arrancó con esa copia: el PDF de inferencia de «Estadística
// básica».
export function readInference(space: Space): string {
  const subject = space.workspace.subjects
    .list()
    .subjects.find((entry) => entry.name === 'Estadística básica');
  const material = space.workspace.materials
    .summaries(subject?.id ?? '')
    .find((entry) => entry.originalName === INFERENCE);
  if (!material) {
    throw new Error('la copia no trae el PDF leído');
  }
  return material.id;
}

// Una cola de materiales que no lee nada, para las pruebas de otros canales que arman el puente
// entero: no arranca sola y, si algo le pidiera leer, el pedido falla (simulado).
export function idleMaterials(workspace: Workspace, clock: Clock): MaterialsService {
  return createMaterialsService({
    workspace,
    clock,
    execute: () => Promise.reject(new Error('(simulado) esta prueba no lee materiales')),
    autoStart: false,
  });
}
