// La voz de Retenia, con sherpa-onnx y los modelos bajados una vez (src/main/models): Kokoro para
// decir texto en inglés y Whisper multilingüe para transcribir. Corre dentro del proceso de
// trabajo de voz, nunca en la ventana. Cada modelo se carga recién la primera vez que se usa y
// queda cargado. En Electron, sherpa-onnx exige no compartir la memoria de sus resultados
// (enableExternalBuffer: false).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sherpa from 'sherpa-onnx-node';
import { encodeWav } from '../../core/audio';

// Las cuatro voces del Laboratorio, por su número dentro de Kokoro v1.0: af_heart (mujer,
// Estados Unidos), am_michael (hombre, Estados Unidos), bf_emma (mujer, Reino Unido) y
// bm_george (hombre, Reino Unido).
const VOICE_SPEAKERS = [3, 16, 21, 26] as const;

export class VoiceModelsMissing extends Error {
  constructor() {
    super('Faltan los modelos de voz');
    this.name = 'VoiceModelsMissing';
  }
}

export interface VoiceEngine {
  speak(text: string, voice: number): { wav: Uint8Array; seconds: number };
  transcribe(samples: Float32Array, sampleRate: number): string;
}

function requireFiles(paths: string[]): void {
  if (!paths.every((path) => existsSync(path))) {
    throw new VoiceModelsMissing();
  }
}

export function createVoiceEngine(
  modelsDir: string,
  { threads = 4 }: { threads?: number } = {},
): VoiceEngine {
  let tts: InstanceType<typeof sherpa.OfflineTts> | null = null;
  let asr: InstanceType<typeof sherpa.OfflineRecognizer> | null = null;

  const kokoro = (file: string) => join(modelsDir, 'kokoro', file);
  const whisper = (file: string) => join(modelsDir, 'whisper', file);

  function voiceModel() {
    if (!tts) {
      const files = {
        model: kokoro('model.int8.onnx'),
        voices: kokoro('voices.bin'),
        tokens: kokoro('tokens.txt'),
        dataDir: kokoro('espeak-ng-data'),
        lexicon: `${kokoro('lexicon-us-en.txt')},${kokoro('lexicon-gb-en.txt')}`,
      };
      requireFiles([
        files.model,
        files.voices,
        files.tokens,
        join(files.dataDir, 'phontab'),
        kokoro('lexicon-us-en.txt'),
        kokoro('lexicon-gb-en.txt'),
      ]);
      tts = new sherpa.OfflineTts({
        model: { kokoro: { ...files, lang: 'en-us' }, numThreads: threads, provider: 'cpu' },
        maxNumSentences: 1,
      });
    }
    return tts;
  }

  function transcriptionModel() {
    if (!asr) {
      const files = {
        encoder: whisper('small-encoder.int8.onnx'),
        decoder: whisper('small-decoder.int8.onnx'),
        tokens: whisper('small-tokens.txt'),
      };
      requireFiles(Object.values(files));
      asr = new sherpa.OfflineRecognizer({
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
          whisper: {
            encoder: files.encoder,
            decoder: files.decoder,
            language: 'en',
            task: 'transcribe',
          },
          tokens: files.tokens,
          numThreads: threads,
          provider: 'cpu',
          debug: 0,
        },
      });
    }
    return asr;
  }

  return {
    speak(text, voice) {
      const sid = VOICE_SPEAKERS[voice];
      if (!Number.isInteger(voice) || sid === undefined) {
        throw new RangeError(`No hay una voz número ${voice}`);
      }
      const audio = voiceModel().generate({ text, sid, speed: 1, enableExternalBuffer: false });
      return {
        wav: encodeWav(audio.samples, audio.sampleRate),
        seconds: audio.samples.length / audio.sampleRate,
      };
    },
    transcribe(samples, sampleRate) {
      const model = transcriptionModel();
      // Menos de un décimo de segundo no alcanza para decir nada.
      if (samples.length < sampleRate / 10) {
        return '';
      }
      const stream = model.createStream();
      stream.acceptWaveform({ samples, sampleRate });
      model.decode(stream);
      return model.getResult(stream).text;
    },
  };
}
