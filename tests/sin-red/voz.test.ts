import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { decodeWav } from '../../src/core/audio';
import { heardText } from '../../src/core/speech';
import { createVoiceEngine, VoiceModelsMissing } from '../../src/main/workers/voice-engine';
import { ROOT } from '../../tools/lib/proceso.mjs';
import { devModelsDir } from '../apoyo/modelos';

// La voz y la transcripción de Retenia con los modelos reales (Kokoro y Whisper vía sherpa-onnx)
// y la red bloqueada: lo mismo que corre el proceso de trabajo de voz, sin Electron alrededor.

const engine = createVoiceEngine(devModelsDir(), { threads: 2 });
const PHRASE = 'The weather is nice today';

// La energía media del audio: cero es silencio.
function loudness(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / Math.max(1, samples.length));
}

describe('voz (Kokoro)', () => {
  it('[CA-025] con los modelos listos y sin internet, dice «The weather is nice today» con cada una de las cuatro voces: audio WAV no vacío', () => {
    const spoken = [0, 1, 2, 3].map((voice) => engine.speak(PHRASE, voice));
    for (const { wav, seconds } of spoken) {
      const audio = decodeWav(wav);
      expect(audio.sampleRate).toBe(24000);
      expect(seconds).toBeGreaterThan(1);
      expect(seconds).toBeLessThan(5);
      expect(audio.samples.length).toBe(Math.round(seconds * audio.sampleRate));
      expect(loudness(audio.samples)).toBeGreaterThan(0.01);
    }
    // Cuatro voces que suenan distintas: ni dos audios iguales.
    const fingerprints = spoken.map(({ wav }) => Buffer.from(wav).toString('base64'));
    expect(new Set(fingerprints).size).toBe(4);
  });

  it('[CA-025] no acepta una voz que no existe', () => {
    expect(() => engine.speak(PHRASE, 4)).toThrow();
  });
});

describe('transcripción (Whisper)', () => {
  it('[CA-026] transcribe el audio de ejemplo y entiende «good morning»', () => {
    const audio = decodeWav(
      new Uint8Array(readFileSync(join(ROOT, 'datos-de-ejemplo', 'good-morning.wav'))),
    );
    expect(audio.sampleRate).toBe(16000);
    expect(heardText(engine.transcribe(audio.samples, audio.sampleRate))).toBe('good morning');
  });

  it('[CA-026] lo que dice Kokoro, Whisper lo entiende: «The weather is nice today»', () => {
    const { wav } = engine.speak(PHRASE, 1);
    const audio = decodeWav(wav);
    expect(heardText(engine.transcribe(audio.samples, audio.sampleRate))).toBe(
      'the weather is nice today',
    );
  });
});

describe('sin modelos', () => {
  const empty = mkdtempSync(join(tmpdir(), 'retenia-sin-modelos-'));
  afterAll(() => rmSync(empty, { recursive: true, force: true }));

  it('[CA-024] sin los modelos bajados, decir o transcribir avisa que faltan en vez de colgarse', () => {
    const missing = createVoiceEngine(empty, { threads: 1 });
    expect(() => missing.speak(PHRASE, 0)).toThrow(VoiceModelsMissing);
    expect(() => missing.transcribe(new Float32Array(16000), 16000)).toThrow(VoiceModelsMissing);
  });
});
