// Un proceso de trabajo sin padre no tiene para quién trabajar: si el proceso principal desaparece
// de golpe (Retenia se cerró a la fuerza), el de trabajo se cierra solo en un segundo. Así no queda
// leyendo un PDF ni ocupando memoria, y al volver a abrir no hay dos leyendo lo mismo.
export function watchParent(everyMs = 1000): void {
  const parent = process.ppid;
  const timer = setInterval(() => {
    let alive = true;
    try {
      process.kill(parent, 0);
    } catch {
      alive = false;
    }
    if (!alive || process.ppid !== parent) {
      process.exit(0);
    }
  }, everyMs);
  timer.unref();
}
