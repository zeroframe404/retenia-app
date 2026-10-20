import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseThemeChoice, type ThemeChoice } from '../core/theme';

// Ajustes › «Apariencia»: la elección vive en `ajustes.json` de la carpeta de datos (el mismo
// archivo donde la demostración guarda sus días sumados; cada uno respeta lo del otro). Se
// escribe aparte y se renombra: un corte nunca deja el archivo a medias. Un archivo dañado o un
// valor que no se entiende vuelven a «Según el sistema».

export interface AppearanceStore {
  get(): ThemeChoice;
  set(choice: ThemeChoice): ThemeChoice;
}

function readSettings(file: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function createAppearanceStore(dataDir: string): AppearanceStore {
  const file = join(dataDir, 'ajustes.json');
  return {
    get: () => parseThemeChoice(readSettings(file).appearance),
    set(choice) {
      mkdirSync(dataDir, { recursive: true });
      const temporary = `${file}.tmp`;
      writeFileSync(
        temporary,
        `${JSON.stringify({ ...readSettings(file), appearance: choice })}\n`,
      );
      renameSync(temporary, file);
      return choice;
    },
  };
}
