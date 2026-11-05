// Las teclas de la sesión de estudio (Fase 10, CA-072): Espacio muestra la respuesta, 1, 2 y 3
// califican («No la sabía», «Con dudas», «La sabía»), Esc pausa y Ctrl+Z deshace la última
// calificación. Qué hacer con una tecla, sin tocar la pantalla (se prueba aparte).
//
// Para no pisar lo que la tecla ya hace en otro lado:
// - con un cuadro abierto (la ficha, una duda) o dentro del menú «Más», nada: ellos la atienden;
// - una tecla que se mantiene apretada (se repite) no cuenta dos veces;
// - escribiendo en «Tu respuesta…», Espacio y los números escriben y Ctrl+Z deshace el texto; Esc
//   igual pausa (el borrador se guarda antes);
// - con el foco en un botón, Espacio lo aprieta, como en cualquier lado.

type Grade = 'again' | 'hard' | 'good';

export type SessionKeyAction =
  | { kind: 'show' }
  | { kind: 'grade'; grade: Grade }
  | { kind: 'undo' }
  | { kind: 'pause' };

interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  defaultPrevented: boolean;
}

interface TargetLike {
  closest(selector: string): unknown;
}

const FIELD = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
const CONTROL = 'button, a[href], select, input, textarea, [role="radio"], [role="menuitem"]';
const GRADES: Record<string, Grade> = { '1': 'again', '2': 'hard', '3': 'good' };

export function sessionKeyAction(
  event: KeyLike,
  { modalOpen, target }: { modalOpen: boolean; target: TargetLike | null },
): SessionKeyAction | null {
  if (event.defaultPrevented || event.repeat || modalOpen) {
    return null;
  }
  if (target?.closest('[role="menu"]')) {
    return null;
  }
  const modifiers = event.ctrlKey || event.altKey || event.metaKey;
  const inField = Boolean(target?.closest(FIELD));
  if (event.key === 'Escape' && !modifiers && !event.shiftKey) {
    return { kind: 'pause' };
  }
  if (
    event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.code === 'KeyZ' || event.key.toLowerCase() === 'z')
  ) {
    return inField ? null : { kind: 'undo' };
  }
  if (modifiers || event.shiftKey || inField) {
    return null;
  }
  if (event.key === ' ' || event.code === 'Space') {
    return target?.closest(CONTROL) ? null : { kind: 'show' };
  }
  const digit = /^(?:Digit|Numpad)([1-3])$/.exec(event.code)?.[1] ?? event.key;
  const grade = GRADES[digit];
  return grade === undefined ? null : { kind: 'grade', grade };
}
