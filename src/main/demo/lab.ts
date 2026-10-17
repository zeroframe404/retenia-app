import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'zod';
import type { Stopwatch } from '../../core/clock';
import { locatePhrase, type TextItem } from '../../core/highlight';
import { heardText } from '../../core/speech';
import { demoTexts } from '../../preload/contract/demo-texts';
import type { labChannels } from '../../preload/contract/lab';
import type { Notifier } from '../notifications';
import { type WorkerClient, WorkerProblem } from '../supervisor';
import { type ModelStore, ModelsError, type ModelsProblem } from '../voice-models/store';

// El Laboratorio (H-07, solo en «Retenia (prueba)»): los botones de Ajustes › «Demostración» ›
// «Laboratorio». Usa las mismas piezas que la versión real va a usar en sus fases: la carpeta de
// modelos con su descarga única, el proceso de trabajo de voz, el de materiales y los avisos de
// Windows. Cada respuesta dice cuánto tardó, medido con el cronómetro (no con el reloj de la
// demostración, que está quieto).

type Registry = ReturnType<typeof labChannels>;
export type LabHandlers = {
  [K in keyof Registry]: (
    request: z.output<Registry[K]['request']>,
  ) => Promise<z.input<Registry[K]['response']>>;
};

export interface LabDeps {
  dataDir: string;
  // «Inferencia — capítulos 1 a 4.pdf», el PDF de ejemplo del elenco.
  samplePdf: string;
  stopwatch: Stopwatch;
  models: ModelStore;
  voice: WorkerClient;
  materials: WorkerClient;
  notifier: Notifier;
  microphoneAccess: () => 'granted' | 'denied';
  openMicrophoneSettings: () => Promise<void>;
}

// La frase que «Leer PDF de prueba» resalta en la página 1 (es texto del PDF de ejemplo).
const PHRASE =
  'Una muestra es una parte de la población que se elige para observarla y sacar conclusiones sobre el todo.';

// Tiempo límite de cada tarea (docs/arquitectura.md, sección 1): voz 60 s, el texto de una
// página de PDF 30 s y el reconocimiento de una página 120 s.
const LIMITS = { voice: 60_000, pdfPage: 30_000, ocrPage: 120_000 };

// Lo que dice Windows del micrófono (systemPreferences.getMediaAccessStatus) se traduce en
// permitido o bloqueado. La variante de prueba lo puede simular bloqueado (RETENIA_SIMULAR_
// MICROFONO=bloqueado, en la punta a punta).
export function microphoneAccess(
  windowsStatus: string,
  simulated: string | undefined,
): 'granted' | 'denied' {
  if (simulated === 'bloqueado') {
    return 'denied';
  }
  return windowsStatus === 'denied' || windowsStatus === 'restricted' ? 'denied' : 'granted';
}

const voiceProblem = (error: unknown) =>
  error instanceof WorkerProblem && error.problem === 'noModels' ? 'noModels' : 'failed';

export function createLabHandlers(deps: LabDeps): LabHandlers {
  const state = {
    offline: false,
    downloading: false,
    progress: { doneBytes: 0, totalBytes: 0 },
    problem: null as ModelsProblem | null,
  };

  const modelsStatus = () => {
    const status = deps.models.status();
    if (state.downloading) {
      return {
        state: 'downloading' as const,
        doneBytes: Math.max(state.progress.doneBytes, status.doneBytes),
        totalBytes: status.totalBytes,
      };
    }
    if (status.ready) {
      return {
        state: 'ready' as const,
        doneBytes: status.doneBytes,
        totalBytes: status.totalBytes,
      };
    }
    if (state.problem) {
      return {
        state: 'failed' as const,
        doneBytes: status.doneBytes,
        totalBytes: status.totalBytes,
        problem: state.problem,
      };
    }
    return {
      state: 'missing' as const,
      doneBytes: status.doneBytes,
      totalBytes: status.totalBytes,
    };
  };

  return {
    'demo.connection': async () => ({ offline: state.offline }),
    'demo.setConnection': async ({ offline }) => {
      state.offline = offline;
      return { offline };
    },
    'demo.lab.modelsStatus': async () => modelsStatus(),
    'demo.lab.downloadModels': async () => {
      if (!state.downloading && !deps.models.status().ready) {
        state.downloading = true;
        state.problem = null;
        state.progress = deps.models.status();
        deps.models
          .download({
            offline: state.offline,
            onProgress: (progress) => {
              state.progress = progress;
            },
          })
          .catch((error: unknown) => {
            state.problem = error instanceof ModelsError ? error.problem : 'server';
          })
          .finally(() => {
            state.downloading = false;
          });
      }
      return modelsStatus();
    },
    'demo.lab.speak': async ({ text, voice }) => {
      if (state.downloading || !deps.models.status().ready) {
        return { ok: false, problem: 'noModels' };
      }
      const elapsed = deps.stopwatch.start();
      try {
        const spoken = (await deps.voice.request(
          { kind: 'speak', modelsDir: deps.models.dir, text, voice },
          LIMITS.voice,
        )) as { wav: Uint8Array<ArrayBuffer> };
        return { ok: true, audio: spoken.wav, ms: elapsed() };
      } catch (error) {
        return { ok: false, problem: voiceProblem(error) };
      }
    },
    'demo.lab.microphone': async () => ({ access: deps.microphoneAccess() }),
    'demo.lab.openMicrophoneSettings': async () => {
      await deps.openMicrophoneSettings();
      return {};
    },
    'demo.lab.transcribe': async ({ samples, sampleRate }) => {
      if (state.downloading || !deps.models.status().ready) {
        return { ok: false, problem: 'noModels' };
      }
      const elapsed = deps.stopwatch.start();
      try {
        const heard = (await deps.voice.request(
          { kind: 'transcribe', modelsDir: deps.models.dir, samples, sampleRate },
          LIMITS.voice,
        )) as { text: string };
        return { ok: true, text: heardText(heard.text), ms: elapsed() };
      } catch (error) {
        return { ok: false, problem: voiceProblem(error) };
      }
    },
    'demo.lab.readPdf': async () => {
      const elapsed = deps.stopwatch.start();
      try {
        const page = (await deps.materials.request(
          { kind: 'readPdfPage', file: deps.samplePdf, page: 1 },
          LIMITS.pdfPage,
        )) as { width: number; height: number; items: TextItem[] };
        const pdf = new Uint8Array(await readFile(deps.samplePdf));
        return {
          ok: true,
          ms: elapsed(),
          text: page.items.map((item) => item.text).join('\n'),
          width: page.width,
          height: page.height,
          phrase: PHRASE,
          highlight: locatePhrase(page.items, PHRASE) ?? [],
          pdf,
        };
      } catch {
        return { ok: false };
      }
    },
    'demo.lab.ocrPage': async () => {
      const elapsed = deps.stopwatch.start();
      try {
        const scanned = (await deps.materials.request(
          {
            kind: 'ocrPdfPage',
            file: deps.samplePdf,
            page: 9,
            workDir: join(deps.dataDir, 'tmp', 'escaneos'),
          },
          LIMITS.ocrPage,
        )) as { text: string };
        return { ok: true, ms: elapsed(), text: scanned.text };
      } catch {
        return { ok: false };
      }
    },
    'demo.lab.notify': async () => {
      const elapsed = deps.stopwatch.start();
      const { shown } = await deps.notifier.show({
        title: demoTexts.lab.notificationTitle,
        body: demoTexts.lab.notificationBody,
      });
      return shown ? { ok: true, ms: elapsed() } : { ok: false };
    },
  };
}
