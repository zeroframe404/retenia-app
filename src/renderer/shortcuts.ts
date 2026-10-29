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

// Ctrl+Mayús+N: anotar al vuelo desde cualquier pantalla. Por la tecla física («KeyN») para que
// ande igual con cualquier distribución del teclado (con Mayús apretada la letra llega en
// mayúscula).
export function isQuickCapture(event: {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  code: string;
}): boolean {
  return (
    event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === 'KeyN'
  );
}
