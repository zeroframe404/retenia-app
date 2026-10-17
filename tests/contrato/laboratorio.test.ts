import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fixedStopwatch } from '../../src/core/clock';
import { handleMessage } from '../../src/main/bridge';
import { createLabHandlers, type LabDeps, microphoneAccess } from '../../src/main/demo/lab';
import { createNotifier, type NotificationLike } from '../../src/main/notifications';
import type { WorkerClient } from '../../src/main/supervisor';
import { MODEL_FILES } from '../../src/main/voice-models/manifest';
import { createModelStore } from '../../src/main/voice-models/store';
import { runMaterialsTask } from '../../src/main/workers/materials-tasks';
import { channels } from '../../src/preload/contract';
import { demoChannels } from '../../src/preload/contract/demo';
import { demoTexts } from '../../src/preload/contract/demo-texts';
import { labChannels } from '../../src/preload/contract/lab';
import { HIGHLIGHT_PHRASE } from '../../tools/datos-de-ejemplo/contenido.mjs';
import { ROOT } from '../../tools/lib/proceso.mjs';

// El Laboratorio (H-07) visto desde el puente: qué acepta cada botón, qué devuelve y el camino
// del aviso de Windows. Los procesos de trabajo corren acá mismo, con su código real
// (runMaterialsTask); la voz no se usa en esta capa. El aviso de Windows y el micrófono son
// fronteras externas: dobles declarados en docs/plan-de-pruebas.md.

const registry = { ...channels, ...demoChannels(), ...labChannels() };
const LAB_CHANNELS = [
  'demo.connection',
  'demo.setConnection',
  'demo.lab.modelsStatus',
  'demo.lab.downloadModels',
  'demo.lab.speak',
  'demo.lab.microphone',
  'demo.lab.openMicrophoneSettings',
  'demo.lab.transcribe',
  'demo.lab.readPdf',
  'demo.lab.ocrPage',
  'demo.lab.notify',
];

class FakeNotification extends EventEmitter implements NotificationLike {
  shown = false;
  readonly options: { title: string; body: string };
  readonly outcome: 'show' | 'failed';
  constructor(options: { title: string; body: string }, outcome: 'show' | 'failed') {
    super();
    this.options = options;
    this.outcome = outcome;
  }
  show(): void {
    this.shown = true;
    queueMicrotask(() => this.emit(this.outcome));
  }
}

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});
function folder(): string {
  const created = mkdtempSync(join(tmpdir(), 'retenia-laboratorio-'));
  folders.push(created);
  return created;
}

// Un proceso de trabajo que no se tendría que usar.
const unused: WorkerClient = {
  request: () => Promise.reject(new Error('Este proceso de trabajo no se usa en esta prueba')),
  stop: () => undefined,
};

function lab(overrides: Partial<LabDeps> = {}) {
  const created: FakeNotification[] = [];
  const fronts: number[] = [];
  const fetched: string[] = [];
  const dataDir = folder();
  const deps: LabDeps = {
    dataDir,
    samplePdf: join(ROOT, 'datos-de-ejemplo', 'Inferencia — capítulos 1 a 4.pdf'),
    stopwatch: fixedStopwatch(1100),
    models: createModelStore({
      dir: join(dataDir, 'modelos'),
      files: MODEL_FILES,
      fetch: async (url) => {
        fetched.push(String(url));
        throw new Error('La red no se usa en esta prueba');
      },
    }),
    voice: unused,
    materials: {
      request: (message) => runMaterialsTask(message as never),
      stop: () => undefined,
    },
    notifier: createNotifier({
      create: (options) => {
        const notification = new FakeNotification(options, 'show');
        created.push(notification);
        return notification;
      },
      bringToFront: () => fronts.push(1),
    }),
    microphoneAccess: () => 'granted',
    openMicrophoneSettings: async () => undefined,
    ...overrides,
  };
  const handlers = createLabHandlers(deps);
  const call = (channel: string, request: unknown = {}) =>
    handleMessage(handlers, channel, request, registry);
  return { call, created, fronts, fetched };
}

describe('canales del Laboratorio', () => {
  it('existen solo en la variante de prueba', () => {
    const demo = Object.keys(labChannels());
    for (const channel of LAB_CHANNELS) {
      expect(demo).toContain(channel);
      expect(Object.keys(channels)).not.toContain(channel);
    }
  });

  it('[CA-025] «Decir en voz alta» rechaza una frase vacía, una de más de 500 letras y una voz que no existe', () => {
    const speak = registry['demo.lab.speak'].request;
    expect(speak.safeParse({ text: 'The weather is nice today', voice: 0 }).success).toBe(true);
    expect(speak.safeParse({ text: '   ', voice: 0 }).success).toBe(false);
    expect(speak.safeParse({ text: 'a'.repeat(501), voice: 0 }).success).toBe(false);
    expect(speak.safeParse({ text: 'Hi', voice: 4 }).success).toBe(false);
    expect(speak.safeParse({ text: 'Hi', voice: 1.5 }).success).toBe(false);
  });

  it('[CA-026] la grabación viaja como muestras de 16 kHz de 30 segundos como mucho', () => {
    const transcribe = registry['demo.lab.transcribe'].request;
    expect(
      transcribe.safeParse({ samples: new Float32Array(16000), sampleRate: 16000 }).success,
    ).toBe(true);
    expect(transcribe.safeParse({ samples: [0, 0, 0], sampleRate: 16000 }).success).toBe(false);
    expect(
      transcribe.safeParse({ samples: new Float32Array(16000), sampleRate: 44100 }).success,
    ).toBe(false);
    expect(
      transcribe.safeParse({ samples: new Float32Array(16000 * 30 + 1), sampleRate: 16000 })
        .success,
    ).toBe(false);
  });

  it('[CA-026] la grabación no puede venir vacía ni traer valores que no son números', () => {
    const transcribe = registry['demo.lab.transcribe'].request;
    expect(transcribe.safeParse({ samples: new Float32Array(0), sampleRate: 16000 }).success).toBe(
      false,
    );
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const samples = new Float32Array(16000);
      samples[100] = bad;
      expect(transcribe.safeParse({ samples, sampleRate: 16000 }).success).toBe(false);
    }
  });
});

describe('aviso de Windows', () => {
  it('[CA-030] «Probar aviso» muestra la notificación «Retenia · Esto es una prueba» y al tocarla Retenia pasa al frente (simulado)', async () => {
    const { call, created, fronts } = lab();
    expect(await call('demo.lab.notify')).toEqual({ ok: true, ms: 1100 });
    expect(created).toHaveLength(1);
    expect(created[0]?.options).toEqual({ title: 'Retenia', body: 'Esto es una prueba' });
    expect(`${demoTexts.lab.notificationTitle} · ${demoTexts.lab.notificationBody}`).toBe(
      'Retenia · Esto es una prueba',
    );
    expect(created[0]?.shown).toBe(true);
    expect(fronts).toEqual([]);
    created[0]?.emit('click');
    expect(fronts).toEqual([1]);
  });

  it('[CA-030] si Windows no muestra el aviso, el Laboratorio lo dice (simulado)', async () => {
    const { call } = lab({
      notifier: createNotifier({
        create: (options) => new FakeNotification(options, 'failed'),
        bringToFront: () => undefined,
      }),
    });
    expect(await call('demo.lab.notify')).toEqual({ ok: false });
  });

  it('[CA-030] un aviso que Windows pasó al centro de notificaciones sigue guardado hasta que lo tocan (simulado)', async () => {
    const fronts: number[] = [];
    const created: FakeNotification[] = [];
    const notifier = createNotifier({
      create: (options) => {
        const notification = new FakeNotification(options, 'show');
        created.push(notification);
        return notification;
      },
      bringToFront: () => fronts.push(1),
    });
    await notifier.show({ title: 'Retenia', body: 'Esto es una prueba' });
    // Windows lo saca de la pantalla por tiempo: avisa «close», pero todavía se puede tocar.
    created[0]?.emit('close', {}, { reason: 'timedOut' });
    expect(notifier.held()).toBe(1);
    created[0]?.emit('click');
    expect(fronts).toEqual([1]);
    expect(notifier.held()).toBe(0);
  });

  it('[CA-030] un aviso que la persona descartó con la X ya no se guarda (simulado)', async () => {
    const created: FakeNotification[] = [];
    const notifier = createNotifier({
      create: (options) => {
        const notification = new FakeNotification(options, 'show');
        created.push(notification);
        return notification;
      },
      bringToFront: () => undefined,
    });
    await notifier.show({ title: 'Retenia', body: 'Esto es una prueba' });
    await notifier.show({ title: 'Retenia', body: 'Esto es una prueba' });
    created[0]?.emit('close', {}, { reason: 'userCanceled' });
    created[1]?.emit('close', {}, {});
    expect(notifier.held()).toBe(0);
  });
});

describe('lo que devuelven los procesos de trabajo', () => {
  it('[CA-025] una respuesta mal formada del proceso de voz no llega a la ventana (simulado)', async () => {
    const dataDir = folder();
    const models = createModelStore({ dir: join(dataDir, 'modelos'), files: MODEL_FILES });
    const { call } = lab({
      models: { ...models, status: () => ({ ready: true, doneBytes: 1, totalBytes: 1 }) },
      voice: {
        request: async () => ({ wav: 'esto no es audio' }),
        stop: () => undefined,
      },
    });
    expect(await call('demo.lab.speak', { text: 'Hi', voice: 0 })).toEqual({
      ok: false,
      problem: 'failed',
    });
    expect(
      await call('demo.lab.transcribe', { samples: new Float32Array(16000), sampleRate: 16000 }),
    ).toEqual({ ok: false, problem: 'failed' });
  });

  it('[CA-028] una respuesta mal formada del proceso de materiales no llega a la ventana (simulado)', async () => {
    const { call } = lab({
      materials: { request: async () => ({ items: 'nada' }), stop: () => undefined },
    });
    expect(await call('demo.lab.readPdf')).toEqual({ ok: false });
    expect(await call('demo.lab.ocrPage')).toEqual({ ok: false });
  });
});

describe('micrófono', () => {
  it('[CA-027] con el micrófono bloqueado en Windows, «Grabar» se entera antes de pedirlo (simulado)', async () => {
    const { call } = lab({ microphoneAccess: () => 'denied' });
    expect(await call('demo.lab.microphone')).toEqual({ access: 'denied' });
  });

  it('[CA-027] lo que dice Windows del micrófono se traduce en permitido o bloqueado', () => {
    expect(microphoneAccess('granted', undefined)).toBe('granted');
    expect(microphoneAccess('not-determined', undefined)).toBe('granted');
    expect(microphoneAccess('unknown', undefined)).toBe('granted');
    expect(microphoneAccess('denied', undefined)).toBe('denied');
    expect(microphoneAccess('restricted', undefined)).toBe('denied');
    // La variante de prueba lo puede simular bloqueado (punta a punta).
    expect(microphoneAccess('granted', 'bloqueado')).toBe('denied');
    // Con el micrófono de prueba de Chromium (un archivo), lo que diga Windows no cuenta: en la
    // máquina del CI Windows lo informa bloqueado aunque el de prueba ande.
    expect(microphoneAccess('denied', 'archivo')).toBe('granted');
  });
});

describe('modelos y conexión', () => {
  it('[CA-024] sin modelos, el Laboratorio lo dice y «Decir en voz alta» pide descargarlos sin llamar a la voz (simulado)', async () => {
    const { call } = lab();
    expect(await call('demo.lab.modelsStatus')).toMatchObject({ state: 'missing', doneBytes: 0 });
    expect(await call('demo.lab.speak', { text: 'Hi', voice: 0 })).toEqual({
      ok: false,
      problem: 'noModels',
    });
    expect(
      await call('demo.lab.transcribe', { samples: new Float32Array(16000), sampleRate: 16000 }),
    ).toEqual({ ok: false, problem: 'noModels' });
  });

  it('[CA-024] con «Simular sin conexión», «Descargar modelos» termina en «sin conexión» sin salir a la red (simulado)', async () => {
    const { call, fetched } = lab();
    expect(await call('demo.connection')).toEqual({ offline: false });
    expect(await call('demo.setConnection', { offline: true })).toEqual({ offline: true });
    await call('demo.lab.downloadModels');
    let status = (await call('demo.lab.modelsStatus')) as { state: string; problem?: string };
    for (let tries = 0; status.state === 'downloading' && tries < 100; tries++) {
      await new Promise((wake) => setImmediate(wake));
      status = (await call('demo.lab.modelsStatus')) as typeof status;
    }
    expect(status).toMatchObject({ state: 'failed', problem: 'offline' });
    expect(fetched).toEqual([]);
  });
});

describe('PDF', () => {
  it('[CA-028] «Leer PDF de prueba» devuelve el texto de la página 1, dónde resaltar la frase y el PDF para dibujar la página', async () => {
    const { call } = lab();
    const answer = (await call('demo.lab.readPdf')) as {
      ok: true;
      ms: number;
      text: string;
      width: number;
      height: number;
      phrase: string;
      highlight: { x: number; y: number; width: number; height: number }[];
      pdf: Uint8Array;
    };
    expect(answer.ok).toBe(true);
    expect(answer.ms).toBe(1100);
    expect(answer.text).toContain('Capítulo 1 · Población, muestra y estimadores');
    expect(answer.text).toContain('Una muestra es una parte de la población');
    expect(answer.phrase).toBe(HIGHLIGHT_PHRASE);
    expect(answer.highlight).toHaveLength(2);
    expect(Buffer.from(answer.pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    expect(answer.width).toBeCloseTo(595.3, 0);
  });
});
