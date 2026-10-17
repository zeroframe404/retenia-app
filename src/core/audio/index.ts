// Audio WAV de 16 bits y un canal: así viaja la voz de «Decir en voz alta» del proceso de voz a
// la ventana, que lo reproduce tal cual.

const HEADER = 44;

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(HEADER + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(HEADER + i * 2, Math.round(clamped * 32767), true);
  });
  return bytes;
}

// Lee un WAV de 16 bits y un canal (el que arma encodeWav o el audio de ejemplo).
export function decodeWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + 4).values());
  if (bytes.length < HEADER || text(0) !== 'RIFF' || text(8) !== 'WAVE') {
    throw new Error('No es un audio WAV');
  }
  // Los bloques del archivo, uno tras otro, hasta encontrar el formato y los datos.
  let offset = 12;
  let sampleRate = 0;
  while (offset + 8 <= bytes.length) {
    const id = text(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      const pcm = view.getUint16(body, true) === 1;
      const mono = view.getUint16(body + 2, true) === 1;
      const bits16 = view.getUint16(body + 14, true) === 16;
      if (!pcm || !mono || !bits16) {
        throw new Error('El audio no es WAV de 16 bits y un canal');
      }
      sampleRate = view.getUint32(body + 4, true);
    } else if (id === 'data' && sampleRate > 0) {
      const count = Math.floor(Math.min(size, bytes.length - body) / 2);
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = view.getInt16(body + i * 2, true) / 32767;
      }
      return { samples, sampleRate };
    }
    offset = body + size + (size % 2);
  }
  throw new Error('El audio WAV no tiene datos');
}
