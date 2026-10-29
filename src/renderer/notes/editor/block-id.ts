const MAX_MILLISECONDS = 2 ** 48 - 1;

const hex = (bytes: Uint8Array, from: number, to: number) =>
  Array.from(bytes.subarray(from, to), (byte) => byte.toString(16).padStart(2, '0')).join('');

// La ventana no puede leer la hora del sistema (la regla «reloj del sistema» solo deja leerla en
// src/core/clock, y la ventana no importa del núcleo). Los milisegundos de un identificador nuevo
// son entonces los que pasaron desde que se abrió la ventana, siempre en aumento: así los
// identificadores armados en una misma sesión se ordenan por orden de creación.
let lastTick = 0;
function nextTick(): number {
  const elapsed = typeof document === 'undefined' ? null : document.timeline?.currentTime;
  lastTick = Math.max(typeof elapsed === 'number' ? Math.floor(elapsed) : 0, lastTick + 1);
  return lastTick;
}

// El identificador de un renglón nuevo: un UUID versión 7 (48 bits de milisegundos y el resto al
// azar), armado acá porque el renglón nace en la ventana, antes de guardarse. Los armados con más
// milisegundos se ordenan después.
export function newBlockId(milliseconds: number = nextTick()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const time = Math.min(Math.max(Math.floor(milliseconds), 0), MAX_MILLISECONDS);
  for (let index = 0; index < 6; index += 1) {
    bytes[index] = Math.floor(time / 256 ** (5 - index)) % 256;
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  return [
    hex(bytes, 0, 4),
    hex(bytes, 4, 6),
    hex(bytes, 6, 8),
    hex(bytes, 8, 10),
    hex(bytes, 10, 16),
  ].join('-');
}
