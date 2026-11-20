import type { Stage } from './status';

// Cada etapa es idempotente (H-25): su resultado se identifica por la huella del original, la
// unidad, la etapa, la herramienta, su versión y los parámetros. Reprocesar el mismo contenido con
// lo mismo reutiliza lo hecho. Acá se arma el texto canónico de esa clave; la huella SHA-256 la
// calcula quien guarda (src/data).

// JSON con las claves ordenadas y sin espacios: el mismo valor da siempre el mismo texto.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

export interface StageKey {
  originalSha256: string;
  unit: number;
  stage: Stage;
  tool: string;
  toolVersion: string;
  params: unknown;
}

export function stageKeyInput({
  originalSha256,
  unit,
  stage,
  tool,
  toolVersion,
  params,
}: StageKey): string {
  return canonicalJson({ originalSha256, unit, stage, tool, toolVersion, params });
}
