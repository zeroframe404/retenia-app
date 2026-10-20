// El zoom de la ventana con el teclado. Retenia no tiene menú (el de Electron estaba en inglés),
// así que las teclas del zoom no vienen hechas: la ventana las atrapa (Ctrl y + agranda, Ctrl y -
// achica y Ctrl y 0 vuelve al 100 %) y el principal calcula el zoom que sigue con esta regla. Los
// pasos son los de cualquier navegador.

export const ZOOM_LEVELS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5,
] as const;

export type ZoomDirection = 'in' | 'out' | 'reset';

// El zoom que sigue. Desde un zoom entre dos pasos (cambiado por otro medio) se va al paso de
// la escala que viene después en esa dirección; nunca se pasa de los extremos.
export function zoomStep(current: number, direction: ZoomDirection): number {
  if (direction === 'reset') {
    return 1;
  }
  const first = ZOOM_LEVELS[0];
  const last = ZOOM_LEVELS[ZOOM_LEVELS.length - 1] ?? first;
  if (direction === 'in') {
    return ZOOM_LEVELS.find((level) => level > current + 1e-9) ?? last;
  }
  return [...ZOOM_LEVELS].reverse().find((level) => level < current - 1e-9) ?? first;
}
