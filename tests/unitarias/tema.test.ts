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
    expect([...THEME_CHOICES]).toEqual(['light', 'dark', 'system']);
  });

  it('[CA-032] «Claro» y «Oscuro» valen lo mismo sin importar cómo esté el sistema', () => {
    expect(effectiveTheme('light', true)).toBe('light');
    expect(effectiveTheme('light', false)).toBe('light');
    expect(effectiveTheme('dark', true)).toBe('dark');
    expect(effectiveTheme('dark', false)).toBe('dark');
  });

  it('[CA-032] «Según el sistema» sigue al sistema', () => {
    expect(effectiveTheme('system', true)).toBe('dark');
    expect(effectiveTheme('system', false)).toBe('light');
  });

  it.for<ThemeChoice>(['light', 'dark', 'system'])(
    '[CA-032] una elección guardada («%s») se recupera igual',
    (choice) => {
      expect(parseThemeChoice(JSON.parse(JSON.stringify(choice)))).toBe(choice);
    },
  );

  it.for([undefined, null, '', 'Dark', 'oscuro', 3, true, {}, ['dark']])(
    'lo que no es una elección conocida (%o) vuelve a «Según el sistema»',
    (raw) => {
      expect(parseThemeChoice(raw)).toBe('system');
    },
  );

  it('el fondo de la ventana al abrir es el papel de cada tema', () => {
    expect(PAPER_COLOR).toEqual({ light: '#f3f4f6', dark: '#121419' });
  });
});
