// Los modelos de voz de desarrollo (Kokoro y Whisper) en la carpeta de desarrollo
// (tools/lib/modelos.mjs): los usan las pruebas de voz, la punta a punta y el humo del
// instalador. Se bajan una sola vez con el mismo código y el mismo manifiesto que Retenia, así
// que cada archivo se acepta solo si su huella coincide.
import { MODEL_FILES, MODELS_ORIGIN } from '../../src/main/models/manifest.ts';
import { createModelStore } from '../../src/main/models/store.ts';
import { DEV_MODELS_DIR } from './modelos.mjs';

/** @param {number} bytes */
const megabytes = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;

export function devModelsReady() {
  return createModelStore({ dir: DEV_MODELS_DIR, files: MODEL_FILES }).status().ready;
}

/** @param {{ log?: (line: string) => void }} [options] @returns {Promise<string | null>} el problema, o null si quedaron listos */
export async function prepareDevModels({ log = console.log } = {}) {
  const store = createModelStore({
    dir: DEV_MODELS_DIR,
    files: MODEL_FILES,
    origin: MODELS_ORIGIN,
  });
  const before = store.status();
  if (before.ready) {
    log(`Modelos de voz de desarrollo listos en ${DEV_MODELS_DIR}.`);
    return null;
  }
  log(
    `Bajando los modelos de voz de desarrollo (${megabytes(before.totalBytes - before.doneBytes)}, una sola vez) a ${DEV_MODELS_DIR}…`,
  );
  let lastTenth = -1;
  try {
    await store.download({
      onProgress: ({ doneBytes, totalBytes }) => {
        const tenth = Math.floor((doneBytes / totalBytes) * 10);
        if (tenth !== lastTenth) {
          lastTenth = tenth;
          log(`  ${tenth * 10} %`);
        }
      },
    });
  } catch (error) {
    const problem = /** @type {{ problem?: string }} */ (error).problem;
    /** @type {Record<string, string>} */
    const WHY = {
      offline: 'no hay conexión con la página de modelos',
      corrupt: 'un archivo llegó con otra huella y lo descarté',
      server: 'la página de modelos no entregó un archivo',
      disk: 'no hay lugar en el disco',
    };
    return `no pude bajar los modelos de voz de desarrollo: ${WHY[problem ?? ''] ?? String(error)}.`;
  }
  log('Modelos de voz de desarrollo listos: cada huella coincide con el manifiesto.');
  return null;
}
