// Qué tan parecidos son dos textos, de 0 a 1: uno menos la distancia de edición (letras que hay
// que cambiar, sacar o poner) dividida por el largo del más largo. Antes de comparar se pasan a
// minúsculas y se juntan los espacios, porque el reconocimiento de escaneos corta los renglones
// donde los ve.
function normalizeForComparison(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function similarity(a: string, b: string): number {
  const x = normalizeForComparison(a);
  const y = normalizeForComparison(b);
  if (x.length === 0 && y.length === 0) {
    return 1;
  }
  let previous = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const current = [i];
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return 1 - (previous[y.length] ?? 0) / Math.max(x.length, y.length);
}
