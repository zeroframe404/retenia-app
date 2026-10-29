import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

// La campana de Gauss del elenco (la imagen de la nota «Intervalos de confianza»): un PNG de
// 320 por 200 píxeles armado a mano con node:zlib, sin dependencias. Sale igual cada vez.

const WIDTH = 320;
const HEIGHT = 200;
const BASELINE = 170;
const PEAK = 130;
const SIGMA = 45;
const CENTER = 160;
const LEFT = 20;
const RIGHT = 300;

const PAPER = [247, 244, 238];
const AXIS = [140, 140, 140];
const STROKE = [31, 95, 160];
const FILL = [205, 222, 240];

/** @param {number} x @param {number} y */
function pixelAt(x, y) {
  if (x < LEFT || x > RIGHT) {
    return PAPER;
  }
  const curve = BASELINE - PEAK * Math.exp(-0.5 * ((x - CENTER) / SIGMA) ** 2);
  if (Math.abs(y - curve) <= 1.5) {
    return STROKE;
  }
  if (y === BASELINE || y === BASELINE + 1) {
    return AXIS;
  }
  if (y > curve && y < BASELINE) {
    return FILL;
  }
  return PAPER;
}

/**
 * @param {string} type
 * @param {Buffer} data
 */
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, check]);
}

/** El PNG de la campana, como un Buffer. */
export function bellCurvePng() {
  const stride = 1 + WIDTH * 3;
  const raw = Buffer.alloc(stride * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    // Byte de filtro 0 (sin filtro) al principio de cada fila.
    for (let x = 0; x < WIDTH; x++) {
      raw.set(pixelAt(x, y), y * stride + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  // 8 bits por canal, color verdadero, sin entrelazado.
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Escribe `campana.png` en datos-de-ejemplo y deja la misma imagen, embebida, en el elenco
// (`elenco/materias.json`): así viaja con el empaquetador de la variante de prueba y la versión
// real no la lleva.
/** @param {string} folder La carpeta datos-de-ejemplo. */
export function writeBellCurve(folder) {
  const png = bellCurvePng();
  writeFileSync(join(folder, 'campana.png'), png);
  const file = join(folder, 'elenco', 'materias.json');
  const cast = JSON.parse(readFileSync(file, 'utf8'));
  cast.images.campana.base64 = png.toString('base64');
  writeFileSync(file, `${JSON.stringify(cast, null, 2)}\n`);
  return png.length;
}
