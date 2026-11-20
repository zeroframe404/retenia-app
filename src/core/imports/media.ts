// Qué es un archivo de medios por sus primeros bytes (nunca por su nombre) y, si es una imagen, su
// tamaño. Retenia muestra PNG, JPEG, GIF y WebP; reconoce los audios comunes para guardarlos.

export type MediaInfo =
  | { kind: 'image'; mime: string; width: number; height: number }
  | { kind: 'audio'; mime: string }
  | { kind: 'other'; mime: string };

const ascii = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.subarray(from, from + length));
const u16be = (bytes: Uint8Array, at: number) => ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
const u16le = (bytes: Uint8Array, at: number) => (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
const u24le = (bytes: Uint8Array, at: number) => u16le(bytes, at) | ((bytes[at + 2] ?? 0) << 16);
const u32be = (bytes: Uint8Array, at: number) => u16be(bytes, at) * 65536 + u16be(bytes, at + 2);

const MAX_SIDE = 20_000;
const sane = (width: number, height: number) =>
  width >= 1 && height >= 1 && width <= MAX_SIDE && height <= MAX_SIDE;

function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) {
      return null;
    }
    const marker = bytes[at + 1] ?? 0;
    const length = u16be(bytes, at + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: u16be(bytes, at + 5), width: u16be(bytes, at + 7) };
    }
    if (length < 2) {
      return null;
    }
    at += 2 + length;
  }
  return null;
}

function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  const chunk = ascii(bytes, 12, 4);
  if (chunk === 'VP8 ') {
    return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const b0 = bytes[21] ?? 0;
    const b1 = bytes[22] ?? 0;
    const b2 = bytes[23] ?? 0;
    const b3 = bytes[24] ?? 0;
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  if (chunk === 'VP8X') {
    return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) };
  }
  return null;
}

export function mediaInfo(bytes: Uint8Array): MediaInfo {
  let size: { width: number; height: number } | null = null;
  let mime = '';
  if (bytes.length > 24 && ascii(bytes, 1, 3) === 'PNG' && bytes[0] === 0x89) {
    mime = 'image/png';
    size = { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    mime = 'image/jpeg';
    size = jpegSize(bytes);
  } else if (ascii(bytes, 0, 4) === 'GIF8') {
    mime = 'image/gif';
    size = { width: u16le(bytes, 6), height: u16le(bytes, 8) };
  } else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    mime = 'image/webp';
    size = webpSize(bytes);
  }
  if (mime !== '') {
    return size && sane(size.width, size.height)
      ? { kind: 'image', mime, width: size.width, height: size.height }
      : { kind: 'other', mime };
  }
  if (ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) {
    return { kind: 'audio', mime: 'audio/mpeg' };
  }
  if (ascii(bytes, 0, 4) === 'OggS') {
    return { kind: 'audio', mime: 'audio/ogg' };
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') {
    return { kind: 'audio', mime: 'audio/wav' };
  }
  if (ascii(bytes, 0, 4) === 'fLaC') {
    return { kind: 'audio', mime: 'audio/flac' };
  }
  if (ascii(bytes, 4, 4) === 'ftyp') {
    return { kind: 'audio', mime: 'audio/mp4' };
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { kind: 'audio', mime: 'audio/webm' };
  }
  return { kind: 'other', mime: 'application/octet-stream' };
}
