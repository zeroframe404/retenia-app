import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { inject } from 'vitest';
import './plantillas-de-la-corrida';

// Las carpetas de datos que muchas pruebas usan como punto de partida (el elenco sembrado, el PDF
// de inferencia leído) se arman una sola vez por corrida, no una vez por archivo: la primera
// prueba que pide una la arma en una carpeta propia y la deja en la carpeta de la corrida
// (tests/apoyo/plantillas-de-la-corrida.ts) con un solo cambio de nombre; las demás la copian.
// Si dos procesos la arman a la vez, queda la primera y la otra se borra. Si el cambio de nombre
// no se puede hacer (por ejemplo, Windows tiene el archivo tomado un momento), ese proceso usa la
// suya, como antes. Es la misma carpeta, armada por el mismo código.

function runFolder(): string | null {
  try {
    return inject('templatesFolder') ?? null;
  } catch {
    return null;
  }
}

function settle(name: string, built: string, remove: () => void): string {
  const shared = runFolder();
  if (shared === null) {
    process.on('exit', remove);
    return built;
  }
  const target = join(shared, name);
  if (existsSync(target)) {
    remove();
    return target;
  }
  try {
    renameSync(built, target);
    return target;
  } catch {
    if (existsSync(target)) {
      remove();
      return target;
    }
    process.on('exit', remove);
    return built;
  }
}

// `build` arma la carpeta (ya cerrada) y devuelve dónde quedó y cómo borrarla.
export function sharedTemplate(
  name: string,
  build: () => { folder: string; remove: () => void },
): string {
  const shared = runFolder();
  if (shared !== null && existsSync(join(shared, name))) {
    return join(shared, name);
  }
  const { folder, remove } = build();
  return settle(name, folder, remove);
}

export async function sharedTemplateAsync(
  name: string,
  build: () => Promise<{ folder: string; remove: () => void }>,
): Promise<string> {
  const shared = runFolder();
  if (shared !== null && existsSync(join(shared, name))) {
    return join(shared, name);
  }
  const { folder, remove } = await build();
  return settle(name, folder, remove);
}
