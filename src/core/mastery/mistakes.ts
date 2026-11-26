import { letterDiff, normalizeShortAnswer } from '../evaluation';

// El tipo de error de «Mis errores» (CA-155), por regla y sin IA. Es una propuesta: lo podés
// cambiar a mano (queda como un evento nuevo, nada se pisa).

export type MistakeType =
  | 'distraction'
  | 'forgotten'
  | 'confusion'
  | 'calculation'
  | 'missingIdea'
  | 'stepOrder'
  | 'other';

export interface MistakeInput {
  readonly activityType:
    | 'card'
    | 'short'
    | 'numeric'
    | 'options'
    | 'order'
    | 'open'
    | 'procedure'
    | 'decision'
    | 'interleaved';
  readonly written: string;
  readonly expected: string;
  // Lo escrito es la respuesta de otra tarjeta de la materia.
  readonly confused: boolean;
}

// Con hasta 2 letras de diferencia (en una respuesta de 3 letras o más) es un tipeo.
const TYPO_LETTERS = 2;
const TYPO_MIN_LENGTH = 3;

export function mistakeTypeOf(input: MistakeInput): MistakeType {
  switch (input.activityType) {
    case 'numeric':
    // En un procedimiento, el paso que se calcula (el de texto lo cambia quien muestra la lista).
    case 'procedure':
      return 'calculation';
    // Elegir otro método (Fase 18) es confundir dos conceptos, como en las opciones.
    case 'decision':
    case 'options':
      return 'confusion';
    case 'order':
      return 'stepOrder';
    case 'open':
      return 'missingIdea';
    default:
      break;
  }
  if (input.confused) {
    return 'confusion';
  }
  const written = normalizeShortAnswer(input.written);
  const expected = normalizeShortAnswer(input.expected);
  if (written === '' || Array.from(expected).length < TYPO_MIN_LENGTH) {
    return 'forgotten';
  }
  const changes = letterDiff(written, expected).filter((step) => step.op !== 'same').length;
  return changes <= TYPO_LETTERS ? 'distraction' : 'forgotten';
}
