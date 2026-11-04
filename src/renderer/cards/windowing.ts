// Las filas que hay que dibujar de una lista muy larga: solo las que se ven, más un margen. Así una
// biblioteca de miles de tarjetas no arma miles de elementos ni se traba al desplazarla.
export interface WindowInput {
  count: number;
  rowHeight: number;
  viewportHeight: number;
  scrollTop: number;
  overscan: number;
}

export interface WindowSlice {
  // La primera fila que se dibuja y la que viene después de la última.
  start: number;
  end: number;
  // Cuánto hay que bajar el primer renglón dibujado.
  offsetTop: number;
  // El alto de la lista entera, para que la barra de desplazamiento sea la de todas las filas.
  totalHeight: number;
}

export function visibleWindow({
  count,
  rowHeight,
  viewportHeight,
  scrollTop,
  overscan,
}: WindowInput): WindowSlice {
  if (count <= 0) {
    return { start: 0, end: 0, offsetTop: 0, totalHeight: 0 };
  }
  const top = Math.min(Math.max(0, scrollTop), Math.max(0, count * rowHeight - viewportHeight));
  const first = Math.floor(top / rowHeight);
  const last = Math.ceil((top + viewportHeight) / rowHeight);
  const start = Math.max(0, Math.min(count, first - overscan));
  const end = Math.min(count, last + overscan);
  return { start, end, offsetTop: start * rowHeight, totalHeight: count * rowHeight };
}
