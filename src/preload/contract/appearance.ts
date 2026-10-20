import { z } from 'zod';

// Ajustes › «Apariencia»: «Claro», «Oscuro» o «Según el sistema». La elección se guarda en la
// carpeta de datos y se recuerda al cerrar y abrir (CA-032). La lista es la misma que la de
// `core/theme` (el puente no puede importar del núcleo; una prueba comprueba que coinciden).
export const themeChoice = z.enum(['light', 'dark', 'system']);
export type ThemeChoice = z.infer<typeof themeChoice>;

export const appearanceGetRequest = z.strictObject({});
export const appearanceSetRequest = z.strictObject({ choice: themeChoice });
export const appearanceResponse = z.strictObject({ choice: themeChoice });
