// El libro mayor (docs/modelo-de-datos.md, sección 1): en qué orden se recalcula todo y cuál
// es la evaluación vigente de un intento. Reglas puras: sin base ni reloj.

export interface Sequenced {
  readonly seq: number;
  readonly id: string;
}

// El orden canónico es el de registro (el número de secuencia del dispositivo), no la hora:
// «Restablecer fecha» o un reloj de PC atrasado hacen que la hora vaya para atrás, y así el
// recálculo da lo mismo que se calculó en el momento. El identificador solo desempata.
export function compareCanonical(a: Sequenced, b: Sequenced): number {
  if (a.seq !== b.seq) {
    return a.seq - b.seq;
  }
  return compareIds(a.id, b.id);
}

// Los identificadores UUID v7 se ordenan como texto (en el orden en que se crearon).
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function inCanonicalOrder<T extends Sequenced>(events: readonly T[]): T[] {
  return [...events].sort(compareCanonical);
}

export interface VersionedEvaluation {
  readonly id: string;
  readonly version: number;
}

// La vigente es la de mayor versión: enmendar nunca cambia la anterior, agrega otra.
export function currentEvaluation<T extends VersionedEvaluation>(versions: readonly T[]): T | null {
  let current: T | null = null;
  for (const version of versions) {
    if (current === null || version.version > current.version) {
      current = version;
    }
  }
  return current;
}

export function nextEvaluation(current: VersionedEvaluation | null): {
  version: number;
  supersedesId: string | null;
} {
  return current === null
    ? { version: 1, supersedesId: null }
    : { version: current.version + 1, supersedesId: current.id };
}
