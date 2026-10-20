import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// Lectura mínima de los archivos de estilos de la ventana para las pruebas del sistema de diseño.

export const RENDERER = resolve(import.meta.dirname, '../../src/renderer');

export function walk(dir: string, extensions: string[]): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(path, extensions));
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      found.push(path);
    }
  }
  return found;
}

export const rel = (path: string) =>
  relative(resolve(import.meta.dirname, '../..'), path)
    .split('\\')
    .join('/');

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

export interface Declaration {
  file: string;
  property: string;
  value: string;
}

// Todas las declaraciones «propiedad: valor;» de un archivo, sin los comentarios.
export function declarations(file: string): Declaration[] {
  const css = stripComments(readFileSync(file, 'utf8'));
  return [...css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)].map((match) => ({
    file,
    property: match[1] ?? '',
    value: (match[2] ?? '').trim(),
  }));
}

export const TOKENS_FILE = join(RENDERER, 'tokens.css');

// Los archivos de estilos de la ventana, menos el de los tokens.
export function styleFiles(): string[] {
  return walk(RENDERER, ['.css']).filter(
    (file) => file !== TOKENS_FILE && !file.endsWith('fonts.css'),
  );
}

export interface ColorToken {
  light: string;
  dark: string;
}

// Los colores de los tokens: «--color-papel: light-dark(#f3f4f6, #121419);».
export function colorTokens(): Record<string, ColorToken> {
  const css = stripComments(readFileSync(TOKENS_FILE, 'utf8'));
  const tokens: Record<string, ColorToken> = {};
  for (const match of css.matchAll(
    /--color-([a-z-]+):\s*light-dark\((#[0-9a-fA-F]{6}),\s*(#[0-9a-fA-F]{6})\);/g,
  )) {
    tokens[match[1] ?? ''] = { light: match[2] ?? '', dark: match[3] ?? '' };
  }
  return tokens;
}

// Los demás tokens: «--espacio-8: 8px;».
export function plainTokens(): Record<string, string> {
  const css = stripComments(readFileSync(TOKENS_FILE, 'utf8'));
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    const name = match[1] ?? '';
    // Vale la primera definición: la de «reducir movimiento» más abajo la pisa a propósito.
    if (!(name in tokens)) {
      tokens[name] = (match[2] ?? '').trim();
    }
  }
  return tokens;
}
