// El micrófono de la ventana: pide el permiso recién al empezar a grabar (al tocar «Grabar»),
// graba con el grabador de Chromium y al detener devuelve el audio en un canal a 16 kHz, que es
// lo que espera la transcripción. Si Windows bloquea el micrófono, getUserMedia falla con
// NotAllowedError (o NotReadableError) y quien llama muestra cómo habilitarlo.

export interface Recording {
  stop(): Promise<Float32Array<ArrayBuffer>>;
  cancel(): void;
}

const SAMPLE_RATE = 16_000;

async function toMono16k(encoded: ArrayBuffer): Promise<Float32Array<ArrayBuffer>> {
  // El contexto a 16 kHz decodifica y lleva el audio a esa frecuencia de una vez.
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const audio = await context.decodeAudioData(encoded);
    const mono = new Float32Array(audio.length);
    for (let channel = 0; channel < audio.numberOfChannels; channel++) {
      const data = audio.getChannelData(channel);
      for (let i = 0; i < data.length; i++) {
        mono[i] = (mono[i] ?? 0) + (data[i] ?? 0) / audio.numberOfChannels;
      }
    }
    return mono;
  } finally {
    await context.close();
  }
}

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
  const release = () => {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  };
  recorder.start();
  return {
    stop: () =>
      new Promise((resolve, reject) => {
        recorder.addEventListener(
          'stop',
          () => {
            release();
            new Blob(chunks, { type: recorder.mimeType })
              .arrayBuffer()
              .then(toMono16k)
              .then(resolve, reject);
          },
          { once: true },
        );
        recorder.stop();
      }),
    cancel: () => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      release();
    },
  };
}
