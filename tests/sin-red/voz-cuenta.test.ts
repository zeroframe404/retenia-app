import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { decodeWav } from '../../src/core/audio';
import { heardText } from '../../src/core/speech';
import { createVoiceEngine } from '../../src/main/workers/voice-engine';
import { devModelsDir } from '../apoyo/modelos';

// La carpeta de datos de Retenia cuelga de la cuenta de Windows: con una cuenta «Martín», la ruta
// de los modelos lleva «í». Va en un archivo propio, que corre en un proceso nuevo: la parte de
// pronunciación de la voz se prepara una sola vez por proceso y, si otra prueba ya la hubiera
// preparado con una carpeta común, esta pasaría sin probar nada.

const base = mkdtempSync(join(tmpdir(), 'retenia-cuenta-'));
const odd = join(base, 'Martín «modelos»');
symlinkSync(devModelsDir(), odd, 'junction');
afterAll(() => {
  // Primero el acceso (sin seguirlo), después la carpeta.
  rmSync(odd, { force: true });
  rmSync(base, { recursive: true, force: true });
});

describe('carpeta de modelos con letras fuera del inglés', () => {
  it('[CA-025] con «í» y «» en la carpeta de los modelos igual dice la frase y la transcribe', () => {
    const engine = createVoiceEngine(odd, { threads: 2 });
    const { wav } = engine.speak('The weather is nice today', 2);
    const audio = decodeWav(wav);
    expect(audio.samples.length).toBeGreaterThan(audio.sampleRate);
    expect(heardText(engine.transcribe(audio.samples, audio.sampleRate))).toBe(
      'the weather is nice today',
    );
  });
});
