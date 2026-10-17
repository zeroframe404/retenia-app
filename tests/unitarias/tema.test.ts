import { describe, expect, it } from 'vitest';
import {
  effectiveTheme,
  PAPER_COLOR,
  parseThemeChoice,
  THEME_CHOICES,
  type ThemeChoice,
} from '../../src/core/theme';

// Ajustes › «Apariencia»: «Claro», «Oscuro» y «Según el sistema». La elección se recuerda y se
// aplica al instante (CA-032); acá, la regla pura.

describe('apariencia: la elección de tema', () => {
  it('[CA-032] hay tres elecciones: claro, oscuro y según el sistema', () => {
    expect([...THEME_CHOICES]).toEqual(['claro', 'oscuro', 'sistema']);
  });

  it('[CA-032] «Claro» y «Oscuro» valen lo mismo sin importar cómo esté el sistema', () => {
    expect(effectiveTheme('claro', true)).toBe('claro');
    expect(effectiveTheme('claro', false)).toBe('claro');
    expect(effectiveTheme('oscuro', true)).toBe('oscuro');
    expect(effectiveTheme('oscuro', false)).toBe('oscuro');
  });

  it('[CA-032] «Según el sistema» sigue al sistema', () => {
    expect(effectiveTheme('sistema', true)).toBe('oscuro');
    expect(effectiveTheme('sistema', false)).toBe('claro');
  });

  it.for<ThemeChoice>(['claro', 'oscuro', 'sistema'])(
    '[CA-032] una elección guardada («%s») se recupera igual',
    (choice) => {
      expect(parseThemeChoice(JSON.parse(JSON.stringify(choice)))).toBe(choice);
    },
  );

  it.for([undefined, null, '', 'Oscuro', 'dark', 3, true, {}, ['oscuro']])(
    'lo que no es una elección conocida (%o) vuelve a «Según el sistema»',
    (raw) => {
      expect(parseThemeChoice(raw)).toBe('sistema');
    },
  );

  it('el fondo de la ventana al abrir es el papel de cada tema', () => {
    expect(PAPER_COLOR).toEqual({ claro: '#f3f4f6', oscuro: '#121419' });
  });
});
