import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { archivosDelProyecto } from '../../tools/lib/archivos.mjs';
import { correr, RAIZ } from '../../tools/lib/proceso.mjs';

// El entorno de un proceso hijo sin las marcas de Vitest ni la carpeta de la corrida actual.
export function entornoLimpio(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [clave, valor] of Object.entries(process.env)) {
    if (!clave.startsWith('VITEST') && clave !== 'RETENIA_RED_DIR' && clave !== 'NODE_OPTIONS') {
      env[clave] = valor;
    }
  }
  return { ...env, ...extra };
}

export function git(raiz: string, ...args: string[]) {
  return correr(
    'git',
    ['-c', 'user.name=Red de Retenia', '-c', 'user.email=red@retenia.invalid', ...args],
    { cwd: raiz },
  );
}

// Una copia del proyecto en una carpeta temporal, con su propio git y node_modules compartido.
// Los sabotajes automáticos rompen la copia, nunca la carpeta real.
export async function copiarProyecto(): Promise<string> {
  const destino = mkdtempSync(join(tmpdir(), 'retenia-red-'));
  for (const archivo of await archivosDelProyecto(RAIZ)) {
    mkdirSync(dirname(join(destino, archivo)), { recursive: true });
    copyFileSync(join(RAIZ, archivo), join(destino, archivo));
  }
  symlinkSync(join(RAIZ, 'node_modules'), join(destino, 'node_modules'), 'junction');
  // La copia lleva el nombre de la rama real, así sabe en qué fase está.
  const rama = (await git(RAIZ, 'rev-parse', '--abbrev-ref', 'HEAD')).salida.trim();
  await git(destino, 'init', '-q', '-b', rama && rama !== 'HEAD' ? rama : 'copia');
  await git(destino, 'add', '-A');
  await git(destino, 'commit', '-q', '-m', 'copia del proyecto para la red');
  return destino;
}

export function borrarCopia(copia: string): void {
  // Primero el enlace a node_modules, para no tocar nunca el node_modules real.
  rmSync(join(copia, 'node_modules'), { force: true });
  rmSync(copia, { recursive: true, force: true });
}

// Corre la red rápida en una carpeta, aislada (escribe sus informes en una carpeta propia).
export function redEn(raiz: string) {
  return correr(process.execPath, [join(raiz, 'tools', 'verify.mjs')], {
    cwd: raiz,
    env: entornoLimpio({ RETENIA_RED_DIR: join(raiz, '.cache', 'red', 'aislada') }),
    limiteMs: 300_000,
  });
}

// Desde la línea de veredicto hasta el final.
export function veredicto(salida: string): string[] {
  const renglones = salida.trimEnd().split(/\r?\n/);
  const desde = renglones.findIndex((r) => /^(VERDE|ROJO) · /.test(r));
  return desde === -1 ? [] : renglones.slice(desde);
}
