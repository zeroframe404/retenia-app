import { describe, expect, it } from 'vitest';
import { sessionKeyAction } from '../../src/renderer/session/keys';

// Qué hace cada tecla en la sesión de estudio (Fase 10, CA-072), sin pantalla: el destino de la
// tecla es un elemento de mentira que dice dónde está.

const key = (overrides: Partial<Parameters<typeof sessionKeyAction>[0]> = {}) => ({
  key: ' ',
  code: 'Space',
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  repeat: false,
  defaultPrevented: false,
  ...overrides,
});

// Un destino que «está adentro» de lo que diga la lista de selectores.
const at = (...inside: string[]) => ({
  closest: (selector: string) =>
    inside.some((place) => selector.split(',').some((part) => part.trim().startsWith(place)))
      ? {}
      : null,
});
const question = at();

describe('teclas de la sesión', () => {
  it('[CA-072] Espacio muestra la respuesta; 1, 2 y 3 califican; Esc pausa; Ctrl+Z deshace', () => {
    const none = { modalOpen: false, target: question };
    expect(sessionKeyAction(key(), none)).toEqual({ kind: 'show' });
    expect(sessionKeyAction(key({ key: '1', code: 'Digit1' }), none)).toEqual({
      kind: 'grade',
      grade: 'again',
    });
    expect(sessionKeyAction(key({ key: '2', code: 'Numpad2' }), none)).toEqual({
      kind: 'grade',
      grade: 'hard',
    });
    expect(sessionKeyAction(key({ key: '3', code: 'Digit3' }), none)).toEqual({
      kind: 'grade',
      grade: 'good',
    });
    expect(sessionKeyAction(key({ key: 'Escape', code: 'Escape' }), none)).toEqual({
      kind: 'pause',
    });
    expect(sessionKeyAction(key({ key: 'z', code: 'KeyZ', ctrlKey: true }), none)).toEqual({
      kind: 'undo',
    });
  });

  it('[CA-072] una tecla que se repite, una ya atendida o con un cuadro abierto no hace nada', () => {
    expect(
      sessionKeyAction(key({ repeat: true }), { modalOpen: false, target: question }),
    ).toBeNull();
    expect(
      sessionKeyAction(key({ defaultPrevented: true }), { modalOpen: false, target: question }),
    ).toBeNull();
    expect(sessionKeyAction(key(), { modalOpen: true, target: question })).toBeNull();
    expect(
      sessionKeyAction(key({ key: 'Escape', code: 'Escape' }), {
        modalOpen: false,
        target: at('[role="menu"]'),
      }),
    ).toBeNull();
  });

  it('[CA-073] escribiendo en «Tu respuesta…», Espacio, los números y Ctrl+Z son del texto; Esc igual pausa', () => {
    const field = { modalOpen: false, target: at('textarea') };
    expect(sessionKeyAction(key(), field)).toBeNull();
    expect(sessionKeyAction(key({ key: '2', code: 'Digit2' }), field)).toBeNull();
    expect(sessionKeyAction(key({ key: 'z', code: 'KeyZ', ctrlKey: true }), field)).toBeNull();
    expect(sessionKeyAction(key({ key: 'Escape', code: 'Escape' }), field)).toEqual({
      kind: 'pause',
    });
  });

  it('[CA-072] con el foco en un botón, Espacio lo aprieta (no muestra la respuesta); los números sí califican', () => {
    const button = { modalOpen: false, target: at('button') };
    expect(sessionKeyAction(key(), button)).toBeNull();
    expect(sessionKeyAction(key({ key: '3', code: 'Digit3' }), button)).toEqual({
      kind: 'grade',
      grade: 'good',
    });
  });

  it('[CA-072] con Ctrl, Alt o Mayús los números no califican (Ctrl y un número es del riel) y otras teclas no hacen nada', () => {
    const none = { modalOpen: false, target: question };
    expect(sessionKeyAction(key({ key: '1', code: 'Digit1', ctrlKey: true }), none)).toBeNull();
    expect(sessionKeyAction(key({ key: '1', code: 'Digit1', altKey: true }), none)).toBeNull();
    expect(sessionKeyAction(key({ key: '!', code: 'Digit1', shiftKey: true }), none)).toBeNull();
    expect(sessionKeyAction(key({ key: '4', code: 'Digit4' }), none)).toBeNull();
    expect(sessionKeyAction(key({ key: 'a', code: 'KeyA' }), none)).toBeNull();
    expect(
      sessionKeyAction(key({ key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true }), none),
    ).toBeNull();
    expect(
      sessionKeyAction(key({ key: 'Escape', code: 'Escape', ctrlKey: true }), none),
    ).toBeNull();
    expect(sessionKeyAction(key(), { modalOpen: false, target: null })).toEqual({ kind: 'show' });
  });
});
