import { join } from 'node:path';

// El almacén de originales (Fase 13): `originales\<sha256>.<ext>` dentro de la carpeta de datos.
// El nombre es la huella del contenido, así un mismo archivo se guarda una sola vez, y nunca se
// modifica (queda de solo lectura). El nombre que tenía el archivo es un dato del material, no una
// ruta.

const ORIGINAL_EXTENSIONS = ['pdf', 'docx', 'md', 'txt'] as const;
export type OriginalExtension = (typeof ORIGINAL_EXTENSIONS)[number];

const SHA256 = /^[0-9a-f]{64}$/;

export function isOriginalExtension(value: string): value is OriginalExtension {
  return (ORIGINAL_EXTENSIONS as readonly string[]).includes(value);
}

// La ruta de un original. Devuelve null si la huella o la extensión no son las esperadas: nunca se
// arma una ruta con otra cosa.
export function originalPath(originalsDir: string, sha256: string, ext: string): string | null {
  if (!SHA256.test(sha256) || !isOriginalExtension(ext)) {
    return null;
  }
  return join(originalsDir, `${sha256}.${ext}`);
}

export const MIME: Record<OriginalExtension, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
};
