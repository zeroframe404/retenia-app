import { describe, expect, it } from 'vitest';
import {
  failTask,
  MAX_ATTEMPTS,
  MAX_RECOVERIES,
  pickNext,
  recoverTask,
  STALE_MS,
  startTask,
  type TaskState,
} from '../../src/core/materials/queue';
import { canonicalJson, stageKeyInput } from '../../src/core/materials/stage-key';
import { materialState, stageView } from '../../src/core/materials/status';

// La cola de los materiales (H-25): qué tarea sigue, qué pasa cuando una falla o cuando Retenia
// se cerró a mitad de camino, y en qué estado queda cada material.

const task = (over: Partial<TaskState> = {}): TaskState => ({
  id: 't1',
  status: 'pending',
  attempts: 0,
  recoveries: 0,
  runnerId: null,
  heartbeatAt: null,
  ...over,
});

describe('reintentos', () => {
  it('son 3 intentos en total: tras 2 reintentos fallidos la unidad queda «Requiere revisión»', () => {
    expect(MAX_ATTEMPTS).toBe(3);
    let state = task();
    for (let attempt = 1; attempt <= 2; attempt++) {
      state = startTask(state, 'arranque-1', 1000);
      expect(state).toMatchObject({ status: 'running', attempts: attempt });
      state = failTask(state, 'timeout');
      expect(state.status).toBe('pending');
    }
    state = failTask(startTask(state, 'arranque-1', 1000), 'crashed');
    expect(state).toMatchObject({ status: 'review', attempts: 3 });
  });

  it('una falla determinista (un PDF dañado) no se reintenta', () => {
    const state = failTask(startTask(task(), 'arranque-1', 0), 'deterministic');
    expect(state).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('exceso de memoria y falla desconocida cuentan como intento fallido', () => {
    expect(failTask(startTask(task(), 'a', 0), 'memory').status).toBe('pending');
    expect(failTask(startTask(task(), 'a', 0), 'unknown').status).toBe('pending');
  });
});

describe('[CA-105] una tarea «en curso» sin latido vuelve a «pendiente»', () => {
  it('al abrir, la de otro arranque vuelve enseguida y no cuenta como intento', () => {
    const running = startTask(task(), 'arranque-viejo', 1000);
    const back = recoverTask(running, { runnerId: 'arranque-nuevo', now: 1001 });
    expect(back).toMatchObject({ status: 'pending', attempts: 0, recoveries: 1, runnerId: null });
  });

  it('en el mismo arranque, vuelve recién cuando el latido tiene más de 15 s', () => {
    const running = startTask(task(), 'arranque-1', 0);
    expect(STALE_MS).toBe(15_000);
    expect(recoverTask(running, { runnerId: 'arranque-1', now: 15_000 })).toBeNull();
    expect(recoverTask(running, { runnerId: 'arranque-1', now: 15_001 })?.status).toBe('pending');
  });

  it('una tarea que no está en curso no cambia', () => {
    expect(recoverTask(task(), { runnerId: 'x', now: 99_999 })).toBeNull();
    expect(recoverTask(task({ status: 'done' }), { runnerId: 'x', now: 99_999 })).toBeNull();
  });

  it('tope de 3 vueltas: una página que tumba el programa no lo hace para siempre', () => {
    expect(MAX_RECOVERIES).toBe(3);
    let state = task();
    for (let round = 1; round <= 3; round++) {
      state = recoverTask(startTask(state, `a${round}`, 0), { runnerId: 'otro', now: 0 }) ?? state;
      expect(state).toMatchObject({ status: 'pending', attempts: 0, recoveries: round });
    }
    // Desde la cuarta, la vuelta cuenta como intento fallido.
    for (let round = 4; round <= 6; round++) {
      state = recoverTask(startTask(state, `a${round}`, 0), { runnerId: 'otro', now: 0 }) ?? state;
    }
    expect(state).toMatchObject({ status: 'review', attempts: 3 });
  });
});

describe('qué sigue', () => {
  const entry = (
    id: string,
    over: Partial<{ status: TaskState['status']; addedAt: string; stage: number; unit: number }>,
  ) => ({
    id,
    status: 'pending' as const,
    addedAt: '2027-03-15T10:00:00.000Z',
    stage: 2,
    unit: 1,
    ...over,
  });

  it('el material más viejo primero, después la etapa, después la unidad', () => {
    const next = pickNext([
      entry('nuevo', { addedAt: '2027-03-15T10:05:00.000Z', stage: 0 }),
      entry('p3', { unit: 3 }),
      entry('p2', { unit: 2 }),
      entry('hecha', { status: 'done', unit: 1 }),
    ]);
    expect(next?.id).toBe('p2');
  });

  it('sin pendientes, nada; las canceladas no cuentan', () => {
    expect(pickNext([entry('c', { status: 'cancelled' })])).toBeNull();
    expect(pickNext([])).toBeNull();
  });
});

describe('estado de un material', () => {
  const base = {
    errorCode: null,
    unitCount: 12 as number | null,
    units: [] as { status: 'pending' | 'ready' | 'no_text' | 'review' }[],
    tasks: [] as {
      stage: 'validate' | 'extract' | 'structure' | 'normalize' | 'index';
      status: TaskState['status'];
    }[],
  };
  const units = (ready: number, noText: number, review: number, pending: number) => [
    ...Array.from({ length: ready }, () => ({ status: 'ready' as const })),
    ...Array.from({ length: noText }, () => ({ status: 'no_text' as const })),
    ...Array.from({ length: review }, () => ({ status: 'review' as const })),
    ...Array.from({ length: pending }, () => ({ status: 'pending' as const })),
  ];

  it('«Recibido»: guardado, sin ninguna tarea empezada', () => {
    expect(
      materialState({
        ...base,
        unitCount: null,
        tasks: [{ stage: 'validate', status: 'pending' }],
      }),
    ).toEqual({ kind: 'received' });
  });

  it('«Procesando n de N»: n son las unidades leídas', () => {
    expect(
      materialState({
        ...base,
        units: units(3, 1, 0, 8),
        tasks: [
          { stage: 'validate', status: 'done' },
          { stage: 'extract', status: 'running' },
        ],
      }),
    ).toEqual({ kind: 'processing', read: 4, total: 12 });
  });

  it('[CA-104] «Listo» con una página sin texto (un escaneo): cuenta como leída', () => {
    expect(
      materialState({
        ...base,
        units: units(11, 1, 0, 0),
        tasks: [
          { stage: 'validate', status: 'done' },
          { stage: 'index', status: 'done' },
        ],
      }),
    ).toEqual({ kind: 'ready' });
  });

  it('«Parcialmente procesado»: una unidad en revisión, o cancelado con páginas leídas', () => {
    expect(
      materialState({
        ...base,
        unitCount: 52,
        units: units(48, 0, 4, 0),
        tasks: [{ stage: 'index', status: 'done' }],
      }),
    ).toEqual({ kind: 'partial', read: 48, total: 52 });
    expect(
      materialState({
        ...base,
        units: units(5, 0, 0, 7),
        tasks: [
          { stage: 'validate', status: 'done' },
          { stage: 'extract', status: 'cancelled' },
        ],
      }),
    ).toEqual({ kind: 'partial', read: 5, total: 12, cancelled: true });
  });

  it('cancelado antes de leer nada: «Recibido»', () => {
    expect(
      materialState({
        ...base,
        unitCount: null,
        tasks: [{ stage: 'validate', status: 'cancelled' }],
      }),
    ).toEqual({ kind: 'received', cancelled: true });
  });

  it('«Requiere revisión»: no se pudo leer ninguna unidad', () => {
    expect(
      materialState({
        ...base,
        unitCount: 2,
        units: units(0, 0, 2, 0),
        tasks: [{ stage: 'index', status: 'done' }],
      }),
    ).toEqual({ kind: 'review' });
  });

  it('«Error»: falló la recepción, la identificación o la validación', () => {
    expect(materialState({ ...base, errorCode: 'notPdf' })).toEqual({
      kind: 'error',
      problem: 'notPdf',
    });
  });
});

describe('[CA-104] las etapas que se ven, con sus conteos reales', () => {
  it('a mitad de la extracción: guardado hecho, texto en curso con su conteo', () => {
    const view = stageView({
      kind: 'pdf',
      unitCount: 12,
      units: [
        { status: 'ready', chars: 900 },
        { status: 'ready', chars: 1200 },
        { status: 'no_text', chars: 0 },
        ...Array.from({ length: 9 }, () => ({ status: 'pending' as const, chars: 0 })),
      ],
      paragraphs: 0,
      tasks: [
        { stage: 'validate', status: 'done' },
        { stage: 'extract', status: 'running' },
      ],
    });
    expect(view).toEqual([
      { id: 'saved', status: 'done' },
      { id: 'extracted', status: 'current', withText: 2, total: 12 },
      { id: 'sections', status: 'pending' },
      { id: 'ready', status: 'pending' },
    ]);
  });

  it('terminado: las cuatro hechas, «11 de 12» páginas con texto', () => {
    const view = stageView({
      kind: 'pdf',
      unitCount: 12,
      units: [
        ...Array.from({ length: 11 }, () => ({ status: 'ready' as const, chars: 500 })),
        { status: 'no_text', chars: 0 },
      ],
      paragraphs: 60,
      tasks: [
        { stage: 'validate', status: 'done' },
        { stage: 'extract', status: 'done' },
        { stage: 'structure', status: 'done' },
        { stage: 'normalize', status: 'done' },
        { stage: 'index', status: 'done' },
      ],
    });
    expect(view.map((stage) => stage.status)).toEqual(['done', 'done', 'done', 'done']);
    expect(view[1]).toEqual({ id: 'extracted', status: 'done', withText: 11, total: 12 });
  });

  it('en Word, Markdown y texto la extracción cuenta párrafos', () => {
    const view = stageView({
      kind: 'docx',
      unitCount: 1,
      units: [{ status: 'ready', chars: 400 }],
      paragraphs: 24,
      tasks: [
        { stage: 'validate', status: 'done' },
        { stage: 'extract', status: 'done' },
        { stage: 'structure', status: 'running' },
      ],
    });
    expect(view[1]).toEqual({ id: 'extracted', status: 'done', paragraphs: 24 });
    expect(view[2]).toEqual({ id: 'sections', status: 'current' });
  });

  it('antes de validar, la primera etapa está en curso', () => {
    const view = stageView({
      kind: 'pdf',
      unitCount: null,
      units: [],
      paragraphs: 0,
      tasks: [{ stage: 'validate', status: 'pending' }],
    });
    expect(view[0]).toEqual({ id: 'saved', status: 'current' });
  });
});

describe('clave de cada etapa', () => {
  it('el JSON canónico no depende del orden de las claves', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });

  it('huella, unidad, etapa, herramienta, versión y parámetros: cambiar cualquiera cambia la clave', () => {
    const input = {
      originalSha256: 'a'.repeat(64),
      unit: 3,
      stage: 'extract' as const,
      tool: 'pdfjs-dist',
      toolVersion: '6.4.299',
      params: { textLayer: true },
    };
    const key = stageKeyInput(input);
    expect(stageKeyInput({ ...input })).toBe(key);
    for (const changed of [
      { ...input, originalSha256: 'b'.repeat(64) },
      { ...input, unit: 4 },
      { ...input, stage: 'validate' as const },
      { ...input, tool: 'otra' },
      { ...input, toolVersion: '6.4.300' },
      { ...input, params: { textLayer: false } },
    ]) {
      expect(stageKeyInput(changed)).not.toBe(key);
    }
  });
});
