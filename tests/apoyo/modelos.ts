import { MODEL_FILES } from '../../src/main/voice-models/manifest';
import { createModelStore } from '../../src/main/voice-models/store';
import { DEV_MODELS_DIR } from '../../tools/lib/modelos.mjs';

// Los modelos de voz de desarrollo (Kokoro y Whisper), los mismos que baja Retenia, ya bajados y
// verificados por huella en la carpeta de desarrollo (tools/lib/modelos.mjs). La red los prepara
// sola antes de las pruebas; si faltan, la prueba lo dice en castellano en vez de fallar raro.
export function devModelsDir(): string {
  const status = createModelStore({ dir: DEV_MODELS_DIR, files: MODEL_FILES }).status();
  if (!status.ready) {
    throw new Error(
      `Faltan los modelos de voz de desarrollo en ${DEV_MODELS_DIR}: corré «node tools/preparar.mjs».`,
    );
  }
  return DEV_MODELS_DIR;
}
