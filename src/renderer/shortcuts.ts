export type ZoomDirection = 'in' | 'out' | 'reset';

// Qué hace una tecla apretada junto con Ctrl sobre el zoom de la ventana, o nada. «=» es la misma
// tecla que «+» sin Mayús y «_» la misma que «-» con Mayús. Las teclas de números del 1 al 9 no se
// tocan: Ctrl y 1 a Ctrl y 6 abren los destinos del riel.
export function zoomDirection(key: string): ZoomDirection | null {
  if (key === '+' || key === '=') {
    return 'in';
  }
  if (key === '-' || key === '_') {
    return 'out';
  }
  return key === '0' ? 'reset' : null;
}
