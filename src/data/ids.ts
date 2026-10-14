import { randomUUIDv7 } from 'node:crypto';

// Identificadores UUID versión 7 en texto (docs/modelo-de-datos.md): ordenables por tiempo.
// `randomUUIDv7` de Node no garantiza el orden dentro del mismo milisegundo, y con el reloj de
// demostración (fijo) todo pasa en el mismo instante: acá se garantiza que cada identificador
// sea mayor que el anterior, para que ordenar por identificador sea ordenar por creación.
let last = '';

function increment(id: string): string | null {
  const head = id.slice(0, 24);
  const next = BigInt(`0x${id.slice(24)}`) + 1n;
  return next > 0xffffffffffffn ? null : `${head}${next.toString(16).padStart(12, '0')}`;
}

export function newId(): string {
  let candidate: string = randomUUIDv7();
  while (candidate <= last) {
    candidate = increment(last) ?? randomUUIDv7();
  }
  last = candidate;
  return candidate;
}
