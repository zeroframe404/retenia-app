import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkerProblem } from '../../src/main/supervisor';
import { runMaterialsTask } from '../../src/main/workers/materials-tasks';
import type { MaterialsTask } from '../../src/main/workers/protocol';
import { readRows } from '../apoyo/base-cruda';
import { closeSpaces, openSpace, type Space } from '../apoyo/espacio';
import { openMaterials, removeTempFolders, sample, statisticsSubject } from '../apoyo/materiales';

// La cola persistente (H-25, CA-105): sobrevive a que Retenia se cierre en cualquier etapa,
// reintenta lo que falló por culpa del proceso de trabajo y deja «Requiere revisión» lo que no se
// pudo leer después de dos reintentos.

afterEach(() => {
  closeSpaces();
  removeTempFolders();
});

const APUNTE = 'Apunte 3.pdf';
const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

const blocksOf = (space: Space) =>
  readRows(
    space.file,
    'SELECT type, level, unit_no, raw_text, normalized_text, transformations FROM material_blocks ORDER BY position',
  );

// Lo que deja una corrida sin cortes: contra esto se compara cada reanudación.
async function uninterrupted() {
  const space = openSpace();
  const subjectId = statisticsSubject(space);
  const { service } = openMaterials(space);
  await service.addFiles({ paths: [sample(APUNTE)], subjectId });
  await service.whenIdle();
  return blocksOf(space);
}

const never = () => new Promise<never>(() => undefined);

describe('[CA-105] cerrar Retenia a mitad de camino y volver a abrir', () => {
  const stages: { name: string; where: string; stop: (task: MaterialsTask) => boolean }[] = [
    { name: 'validación', where: "stage = 'validate'", stop: (task) => task.kind === 'validate' },
    {
      name: 'extracción de la página 1',
      where: "stage = 'extract' AND unit_no = 1",
      stop: (task) => task.kind === 'extract' && task.unit === 1,
    },
    {
      name: 'extracción de la página 2',
      where: "stage = 'extract' AND unit_no = 2",
      stop: (task) => task.kind === 'extract' && task.unit === 2,
    },
    { name: 'estructura', where: "stage = 'structure'", stop: (task) => task.kind === 'structure' },
    {
      name: 'normalización',
      where: "stage = 'normalize'",
      stop: (task) => task.kind === 'normalize',
    },
  ];

  for (const stage of stages) {
    it(`[CA-105] (simulado) cortado en la ${stage.name}: sigue desde donde estaba, termina igual y el original está`, async () => {
      const expected = await uninterrupted();
      const space = openSpace();
      const subjectId = statisticsSubject(space);
      const first = openMaterials(space, {
        runnerId: 'arranque-1',
        execute: async (task) => (stage.stop(task) ? never() : runMaterialsTask(task)),
      });
      await first.service.addFiles({ paths: [sample(APUNTE)], subjectId });
      // Con la máquina cargada (la red completa corre todo junto) llegar a la etapa puede tardar
      // más que el segundo que se espera por defecto: lo que se espera no cambia, solo cuánto.
      await expect
        .poll(
          () =>
            readRows(
              space.file,
              `SELECT COUNT(*) AS n FROM ingest_tasks WHERE status = 'running' AND ${stage.where}`,
            )[0]?.n,
          { timeout: 15_000 },
        )
        .toBe(1);
      // Se corta: nadie avisa nada, la tarea queda «en curso» en la base.
      first.service.abandon();
      space.reopen();
      const second = openMaterials(space, { runnerId: 'arranque-2' });
      second.service.start();
      await second.service.whenIdle();
      const [material] = second.service.list({ subjectId }).materials;
      expect(material?.state).toEqual({ kind: 'ready' });
      expect(blocksOf(space)).toEqual(expected);
      // Lo hecho antes del corte no se volvió a hacer.
      const redone = second.executed.filter((label) => first.executed.slice(0, -1).includes(label));
      expect(redone).toEqual([]);
      const [row] = readRows(space.file, 'SELECT original_sha256 FROM materials');
      expect(sha256(join(space.dataDir, 'originales', `${String(row?.original_sha256)}.pdf`))).toBe(
        sha256(sample(APUNTE)),
      );
    });
  }

  it('[CA-105] (simulado) la vuelta a «pendiente» por un corte no cuenta como intento fallido', async () => {
    const space = openSpace();
    const subjectId = statisticsSubject(space);
    const first = openMaterials(space, {
      runnerId: 'arranque-1',
      execute: async (task) => (task.kind === 'extract' ? never() : runMaterialsTask(task)),
    });
    await first.service.addFiles({ paths: [sample(APUNTE)], subjectId });
    await expect
      .poll(
        () =>
          readRows(
            space.file,
            "SELECT COUNT(*) AS n FROM ingest_tasks WHERE status = 'running' AND stage = 'extract'",
          )[0]?.n,
      )
      .toBe(1);
    first.service.abandon();
    space.reopen();
    const second = openMaterials(space, { runnerId: 'arranque-2' });
    second.service.start();
    await second.service.whenIdle();
    const rows = readRows(
      space.file,
      "SELECT attempts, recoveries FROM ingest_tasks WHERE stage = 'extract' AND unit_no = 1",
    );
    expect(rows).toEqual([{ attempts: 1, recoveries: 1 }]);
  });
});

describe('reintentos con un proceso de trabajo que falla (simulado)', () => {
  it('(simulado) un tiempo vencido se reintenta; tras dos reintentos la página queda «Requiere revisión» y el material «Parcialmente procesado»', async () => {
    const space = openSpace();
    const subjectId = statisticsSubject(space);
    const { service, executed } = openMaterials(space, {
      timeouts: { extract: 50 },
      execute: async (task) =>
        task.kind === 'extract' && task.unit === 2 ? never() : runMaterialsTask(task),
    });
    await service.addFiles({ paths: [sample(APUNTE)], subjectId });
    await service.whenIdle();
    expect(executed.filter((label) => label === 'extract:2')).toHaveLength(3);
    const [material] = service.list({ subjectId }).materials;
    expect(material?.state).toEqual({ kind: 'partial', read: 1, total: 2 });
    const units = service.get({ materialId: material?.id ?? '' }).units;
    expect(units.map((unit) => unit.status)).toEqual(['ready', 'review']);
  });

  it('(simulado) un proceso que se cae se reintenta y, si a la segunda anda, la página queda bien', async () => {
    const space = openSpace();
    const subjectId = statisticsSubject(space);
    let crashes = 0;
    const { service } = openMaterials(space, {
      execute: async (task) => {
        if (task.kind === 'extract' && task.unit === 1 && crashes === 0) {
          crashes += 1;
          throw new WorkerProblem('crashed');
        }
        return runMaterialsTask(task);
      },
    });
    await service.addFiles({ paths: [sample(APUNTE)], subjectId });
    await service.whenIdle();
    expect(service.list({ subjectId }).materials[0]?.state).toEqual({ kind: 'ready' });
  });

  it('(simulado) sin ninguna página legible el material queda «Requiere revisión»', async () => {
    const space = openSpace();
    const subjectId = statisticsSubject(space);
    const { service } = openMaterials(space, {
      execute: async (task) => {
        if (task.kind === 'extract') {
          throw new WorkerProblem('memory');
        }
        return runMaterialsTask(task);
      },
    });
    await service.addFiles({ paths: [sample(APUNTE)], subjectId });
    await service.whenIdle();
    expect(service.list({ subjectId }).materials[0]?.state).toEqual({ kind: 'review' });
  });

  it('(simulado) una tarea en curso del mismo arranque sin latido hace más de 15 s vuelve a «pendiente»', async () => {
    const space = openSpace();
    const subjectId = statisticsSubject(space);
    // El tiempo que mide el latido (no el de la demostración, que está quieto).
    let elapsed = 0;
    const first = openMaterials(space, {
      runnerId: 'arranque-1',
      stopwatch: { start: () => () => elapsed },
      execute: async (task) => (task.kind === 'extract' ? never() : runMaterialsTask(task)),
    });
    await first.service.addFiles({ paths: [sample(APUNTE)], subjectId });
    await expect
      .poll(
        () =>
          readRows(
            space.file,
            "SELECT COUNT(*) AS n FROM ingest_tasks WHERE status = 'running' AND stage = 'extract'",
          )[0]?.n,
      )
      .toBe(1);
    first.service.abandon();
    elapsed = 15_000;
    expect(first.service.recoverStale()).toBe(0);
    // El mismo arranque, más de 15 segundos sin latido.
    elapsed = 15_001;
    expect(first.service.recoverStale()).toBe(1);
    expect(
      readRows(
        space.file,
        "SELECT status FROM ingest_tasks WHERE stage = 'extract' AND unit_no = 1",
      ),
    ).toEqual([{ status: 'pending' }]);
  });
});

// La pausa de la cola: la usan la suspensión de Windows y la restauración de una copia. El
// proceso de trabajo es un doble (simulado): la página 1 se queda leyendo hasta que la pausa la
// corta, como hace el supervisor con el proceso de verdad.
function heldOnFirstPage(space: Space) {
  let cut: ((error: Error) => void) | null = null;
  let held = false;
  let reached: () => void = () => undefined;
  const atPage = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const opened = openMaterials(space, {
    execute: (task) => {
      if (task.kind === 'extract' && task.unit === 1 && !held) {
        held = true;
        reached();
        return new Promise((_, reject) => {
          cut = reject;
        });
      }
      return runMaterialsTask(task);
    },
    interrupt: () => cut?.(new WorkerProblem('crashed')),
  });
  return { ...opened, atPage };
}

describe('[CA-105] (simulado) la pausa de la cola', () => {
  it('[CA-105] (simulado) pausar corta la página en curso sin contar intento ni recuperación; al soltar, la cola sigue y termina', async () => {
    const space = openSpace();
    const subjectId = statisticsSubject(space);
    const { service, executed, atPage } = heldOnFirstPage(space);
    await service.addFiles({ paths: [sample(APUNTE)], subjectId });
    await atPage;
    await service.pause();
    expect(
      readRows(
        space.file,
        "SELECT status, attempts, recoveries FROM ingest_tasks WHERE stage = 'extract' AND unit_no = 1",
      ),
    ).toEqual([{ status: 'pending', attempts: 0, recoveries: 0 }]);
    const before = executed.length;
    await service.whenIdle();
    expect(executed).toHaveLength(before);
    service.unpause();
    await service.whenIdle();
    expect(service.list({ subjectId }).materials[0]?.state).toEqual({ kind: 'ready' });
  });

  it('[CA-105] (simulado) dos pausas a la vez (Windows se suspende durante una restauración): la cola sigue recién cuando se sueltan las dos', async () => {
    const space = openSpace();
    const subjectId = statisticsSubject(space);
    const { service, executed, atPage } = heldOnFirstPage(space);
    await service.addFiles({ paths: [sample(APUNTE)], subjectId });
    await atPage;
    await service.pause();
    await service.pause();
    service.unpause();
    const before = executed.length;
    await service.whenIdle();
    expect(executed).toHaveLength(before);
    expect(service.list({ subjectId }).materials[0]?.state.kind).not.toBe('ready');
    service.unpause();
    await service.whenIdle();
    expect(service.list({ subjectId }).materials[0]?.state).toEqual({ kind: 'ready' });
  });
});

// Retenia arranca la cola un segundo después de mostrar la ventana. Si la cerrás antes, esa orden
// llega con la cola ya frenada (antes de cerrar) o con la carpeta de datos ya cerrada (al cerrar).
// Antes, en el segundo caso la orden fallaba sin que nadie la atrapara y el programa quedaba
// abierto con un aviso de error, sin terminar de cerrarse.
describe('cerrar Retenia apenas se abre, antes de que arranque la cola', () => {
  it('(simulado) si la orden de arrancar llega con la carpeta de datos ya cerrada, no falla ni lee nada', async () => {
    const space = openSpace();
    const subjectId = statisticsSubject(space);
    const { service, executed } = openMaterials(space, { autoStart: false });
    await service.addFiles({ paths: [sample(APUNTE)], subjectId });
    await service.stop();
    space.workspace.close();
    expect(() => service.start()).not.toThrow();
    await service.whenIdle();
    expect(executed).toEqual([]);
  });

  it('(simulado) si la orden de arrancar llega con la cola ya frenada, no le manda nada al proceso de trabajo y el material sigue pendiente', async () => {
    const space = openSpace();
    const subjectId = statisticsSubject(space);
    const { service, executed } = openMaterials(space, { autoStart: false });
    await service.addFiles({ paths: [sample(APUNTE)], subjectId });
    const before = service.list({ subjectId }).materials[0]?.state;
    await service.stop();
    service.start();
    await service.whenIdle();
    expect(executed).toEqual([]);
    expect(service.list({ subjectId }).materials[0]?.state).toEqual(before);
  });
});
