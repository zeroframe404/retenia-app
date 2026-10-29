import { crc32, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { bellCurvePng } from '../../tools/datos-de-ejemplo/campana.mjs';

// La campana de Gauss del elenco: un PNG armado a mano con node:zlib (sin dependencias).

interface Chunk {
  type: string;
  data: Buffer;
  crc: number;
}

function chunksOf(png: Buffer): Chunk[] {
  const chunks: Chunk[] = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const data = png.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data, crc: png.readUInt32BE(offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

describe('campana.png del elenco', () => {
  const png = bellCurvePng() as Buffer;
  const chunks = chunksOf(png);

  it('es un PNG verdadero: firma, IHDR de 320 por 200 y cierre con IEND', () => {
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const header = chunks[0]?.data;
    expect([header?.readUInt32BE(0), header?.readUInt32BE(4)]).toEqual([320, 200]);
    // 8 bits por canal, color verdadero, sin entrelazado.
    expect([header?.[8], header?.[9], header?.[12]]).toEqual([8, 2, 0]);
  });

  it('cada trozo trae su suma de control correcta', () => {
    for (const chunk of chunks) {
      expect(crc32(Buffer.concat([Buffer.from(chunk.type, 'ascii'), chunk.data])), chunk.type).toBe(
        chunk.crc,
      );
    }
  });

  it('los datos descomprimen a 200 filas de 320 píxeles, cada una con su byte de filtro', () => {
    const raw = inflateSync(chunks[1]?.data ?? Buffer.alloc(0));
    expect(raw.length).toBe(200 * (1 + 320 * 3));
    for (let row = 0; row < 200; row++) {
      expect(raw[row * (1 + 320 * 3)]).toBe(0);
    }
  });

  it('dibuja una curva: hay fondo y trazo, y el trazo está más alto en el medio que en los bordes', () => {
    const raw = inflateSync(chunks[1]?.data ?? Buffer.alloc(0));
    const stride = 1 + 320 * 3;
    const pixel = (x: number, y: number) =>
      raw.subarray(y * stride + 1 + x * 3, y * stride + 1 + x * 3 + 3).toString('hex');
    const background = pixel(0, 0);
    const distinct = new Set<string>();
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 320; x++) {
        distinct.add(pixel(x, y));
      }
    }
    expect(distinct.size).toBeGreaterThan(1);
    const topmost = (x: number) => {
      for (let y = 0; y < 200; y++) {
        if (pixel(x, y) !== background) {
          return y;
        }
      }
      return 200;
    };
    expect(topmost(160)).toBeLessThan(topmost(10));
    expect(topmost(160)).toBeLessThan(topmost(310));
  });

  it('sale igual cada vez que se genera', () => {
    expect(bellCurvePng().equals(png)).toBe(true);
  });
});
