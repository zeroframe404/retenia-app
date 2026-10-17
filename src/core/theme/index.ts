// La apariencia de Retenia: «Claro», «Oscuro» o «Según el sistema». La elección se recuerda entre
// sesiones; esta regla pura decide qué tema se ve y qué hacer con un valor guardado que no se
// entiende.

export const THEME_CHOICES = ['light', 'dark', 'system'] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type Theme = Exclude<ThemeChoice, 'system'>;

// El papel de cada tema (el token `papel` de la ventana): con eso arranca la ventana antes de que
// se dibuje nada, para que no haya un destello del tema equivocado. Una prueba compara estos
// valores con los de `tokens.css`.
export const PAPER_COLOR: Readonly<Record<Theme, string>> = {
  light: '#f3f4f6',
  dark: '#121419',
};

// Lo que se guardó, o «Según el sistema» si no es una elección conocida.
export function parseThemeChoice(raw: unknown): ThemeChoice {
  return THEME_CHOICES.find((choice) => choice === raw) ?? 'system';
}

// El tema que se ve: la elección, o lo que diga el sistema cuando se eligió seguirlo.
export function effectiveTheme(choice: ThemeChoice, systemIsDark: boolean): Theme {
  if (choice === 'system') {
    return systemIsDark ? 'dark' : 'light';
  }
  return choice;
}
