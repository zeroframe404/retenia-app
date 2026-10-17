// Lo que Retenia usa de sherpa-onnx-node, que no trae sus propios tipos de TypeScript.
declare module 'sherpa-onnx-node' {
  interface Wave {
    samples: Float32Array;
    sampleRate: number;
  }

  class OfflineTts {
    constructor(config: unknown);
    readonly numSpeakers: number;
    readonly sampleRate: number;
    generate(request: {
      text: string;
      sid: number;
      speed: number;
      enableExternalBuffer: boolean;
    }): Wave;
  }

  class OfflineStream {
    acceptWaveform(wave: Wave): void;
  }

  class OfflineRecognizer {
    constructor(config: unknown);
    createStream(): OfflineStream;
    decode(stream: OfflineStream): void;
    getResult(stream: OfflineStream): { text: string };
  }

  const sherpa: {
    OfflineTts: typeof OfflineTts;
    OfflineRecognizer: typeof OfflineRecognizer;
  };
  export default sherpa;
}
