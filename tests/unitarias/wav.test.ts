import { describe, expect, it } from 'vitest';
import { decodeWav, encodeWav } from '../../src/core/audio';

// El audio de «Decir en voz alta» viaja del proceso de trabajo de voz a la ventana como un WAV de
// 16 bits, un canal: la ventana lo reproduce tal cual.

const text = (bytes: Uint8Array, start: number, length: number) =>
  Buffer.from(bytes.subarray(start, start + length)).toString('latin1');

describe('audio WAV', () => {
  it('[CA-025] arma un WAV de 16 bits y un canal con su encabezado y sus muestras', () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1]), 24000);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(wav.length).toBe(44 + 5 * 2);
    expect(text(wav, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
    expect(text(wav, 8, 4)).toBe('WAVE');
    expect(text(wav, 12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint32(28, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(wav, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(10);
    expect([0, 1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
      0, 16384, -16383, 32767, -32767,
    ]);
  });

  it('[CA-025] recorta lo que se pasa de volumen en vez de dar la vuelta', () => {
    const wav = encodeWav(new Float32Array([1.7, -3]), 16000);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32767);
  });

  it('[CA-025] lee de vuelta lo que escribió, con la frecuencia de muestreo', () => {
    const samples = new Float32Array([0, 0.25, -0.75, 0.999]);
    const decoded = decodeWav(encodeWav(samples, 16000));
    expect(decoded.sampleRate).toBe(16000);
    expect(Array.from(decoded.samples).map((s) => Math.round(s * 1000) / 1000)).toEqual([
      0, 0.25, -0.75, 0.999,
    ]);
    expect(decodeWav(encodeWav(new Float32Array(0), 16000)).samples.length).toBe(0);
  });

  it('[CA-025] rechaza lo que no es un WAV de 16 bits y un canal', () => {
    expect(() => decodeWav(new Uint8Array(10))).toThrow();
    const stereo = encodeWav(new Float32Array(4), 16000);
    new DataView(stereo.buffer).setUint16(22, 2, true);
    expect(() => decodeWav(stereo)).toThrow();
  });
});
