import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';

// Una carpeta por corrida de Vitest donde quedan las carpetas de datos que muchas pruebas usan
// como punto de partida (el elenco sembrado, el PDF leído: tests/apoyo/plantillas.ts). Cada
// proceso de pruebas arranca un archivo de cero (sin nada en memoria del anterior), así que sin
// esto cada archivo volvía a sembrar el elenco. Se borra al terminar la corrida.
export default function setup(project: TestProject): () => void {
  const folder = mkdtempSync(join(tmpdir(), 'retenia-plantillas-'));
  project.provide('templatesFolder', folder);
  return () => rmSync(folder, { recursive: true, force: true });
}

declare module 'vitest' {
  export interface ProvidedContext {
    templatesFolder: string;
  }
}
