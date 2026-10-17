import { join, resolve } from 'node:path';
import { app, Notification, net, shell, systemPreferences, utilityProcess } from 'electron';
import { systemStopwatch } from '../../core/clock';
import { createNotifier } from '../notifications';
import { createWorkerClient } from '../supervisor';
import { MODEL_FILES, MODELS_ORIGIN } from '../voice-models/manifest';
import { createModelStore } from '../voice-models/store';
import { createLabHandlers, type LabHandlers, microphoneAccess } from './lab';

// Arma el Laboratorio dentro de «Retenia (prueba)» con las piezas de Electron: los dos procesos
// de trabajo (utilityProcess), la red de Chromium para bajar los modelos, los avisos de Windows y
// el estado del micrófono que informa Windows.
//
// Variables que solo lee la variante de prueba, para la punta a punta y el humo del instalador:
//   RETENIA_MODELOS             otra carpeta de modelos (los de desarrollo, ya bajados)
//   RETENIA_MODELOS_ORIGEN      otra dirección de donde bajarlos (un servidor local)
//   RETENIA_MICROFONO_ARCHIVO   un audio WAV que hace de micrófono (el de prueba de Chromium)
//   RETENIA_SIMULAR_MICROFONO   «bloqueado»: el micrófono bloqueado en Windows

const SAMPLE_PDF = 'Inferencia — capítulos 1 a 4.pdf';

// Antes de que Electron esté listo: el micrófono de prueba de Chromium con el audio pedido.
export function prepareLabSwitches(): void {
  const file = process.env.RETENIA_MICROFONO_ARCHIVO;
  if (file) {
    app.commandLine.appendSwitch('use-fake-device-for-media-stream');
    app.commandLine.appendSwitch('use-file-for-fake-audio-capture', resolve(file));
  }
}

export function startLab({
  dataDir,
  bringToFront,
}: {
  dataDir: string;
  bringToFront: () => void;
}): { handlers: LabHandlers; stop: () => void } {
  const here = import.meta.dirname;
  const worker = (file: string, serviceName: string) =>
    createWorkerClient({
      spawn: () => utilityProcess.fork(join(here, file), [], { serviceName }),
    });
  const voice = worker('voice.js', 'Retenia · voz');
  const materials = worker('materials.js', 'Retenia · materiales');
  const models = createModelStore({
    dir: process.env.RETENIA_MODELOS
      ? resolve(process.env.RETENIA_MODELOS)
      : join(dataDir, 'modelos'),
    files: MODEL_FILES,
    origin: process.env.RETENIA_MODELOS_ORIGEN ?? MODELS_ORIGIN,
    fetch: (url, init) => net.fetch(url, init),
  });
  // El PDF de ejemplo viaja junto al programa instalado; sin instalar, está en el proyecto.
  const samplePdf = app.isPackaged
    ? join(process.resourcesPath, 'datos-de-ejemplo', SAMPLE_PDF)
    : resolve(here, '..', '..', '..', 'datos-de-ejemplo', SAMPLE_PDF);
  const handlers = createLabHandlers({
    dataDir,
    samplePdf,
    stopwatch: systemStopwatch(),
    models,
    voice,
    materials,
    notifier: createNotifier({
      create: (options) => new Notification(options),
      bringToFront,
    }),
    microphoneAccess: () =>
      microphoneAccess(
        systemPreferences.getMediaAccessStatus('microphone'),
        process.env.RETENIA_MICROFONO_ARCHIVO ? 'archivo' : process.env.RETENIA_SIMULAR_MICROFONO,
      ),
    openMicrophoneSettings: () => shell.openExternal('ms-settings:privacy-microphone'),
  });
  return {
    handlers,
    stop: () => {
      voice.stop();
      materials.stop();
    },
  };
}
