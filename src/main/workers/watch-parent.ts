// Un proceso de trabajo sin padre no tiene para quién trabajar: si el proceso principal desaparece
// de golpe (Retenia se cerró a la fuerza), el de trabajo se cierra solo en un segundo. Así no queda
// leyendo un PDF ni ocupando memoria, y al volver a abrir no hay dos leyendo lo mismo.
function parentStillThere(parent: number): boolean {
  try {
    process.kill(parent, 0);
  } catch {
    return false;
  }
  return process.ppid === parent;
}

export function watchParent({
  everyMs = 1000,
  parentAlive = parentStillThere,
  exit = (code: number) => process.exit(code),
  every = (tick: () => void, ms: number) => setInterval(tick, ms),
}: {
  everyMs?: number;
  // Las piezas del sistema, cambiables en las pruebas (simulado).
  parentAlive?: (parent: number) => boolean;
  exit?: (code: number) => void;
  every?: (tick: () => void, ms: number) => { unref(): unknown };
} = {}): void {
  const parent = process.ppid;
  const timer = every(() => {
    if (!parentAlive(parent)) {
      exit(0);
    }
  }, everyMs);
  timer.unref();
}
