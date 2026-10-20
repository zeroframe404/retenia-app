import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { projectFiles } from '../../tools/lib/archivos.mjs';
import { ROOT, run } from '../../tools/lib/proceso.mjs';

// El entorno de un proceso hijo sin las marcas de Vitest ni la carpeta de la corrida actual.
export function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('VITEST') && key !== 'RETENIA_RUN_DIR' && key !== 'NODE_OPTIONS') {
      env[key] = value;
    }
  }
  return { ...env, ...extra };
}

export function git(root: string, ...args: string[]) {
  return run(
    'git',
    ['-c', 'user.name=Red de Retenia', '-c', 'user.email=red@retenia.invalid', ...args],
    { cwd: root },
  );
}

// Una carpeta temporal en su ruta larga canónica: en el CI la carpeta temporal viene con
// nombres cortos de Windows (RUNNER~1) y las herramientas no reconocerían sus archivos.
function tempFolder(prefix: string): string {
  return realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
}

function linkNodeModules(copy: string): void {
  symlinkSync(join(ROOT, 'node_modules'), join(copy, 'node_modules'), 'junction');
}

// Una copia del proyecto entero, con su propio git y node_modules compartido. Los sabotajes
// automáticos rompen la copia, nunca la carpeta real.
export async function copyProject(): Promise<string> {
  const copy = tempFolder('retenia-red-');
  for (const file of await projectFiles(ROOT)) {
    mkdirSync(dirname(join(copy, file)), { recursive: true });
    copyFileSync(join(ROOT, file), join(copy, file));
  }
  linkNodeModules(copy);
  // La copia lleva el nombre de la rama real, así sabe en qué fase está.
  const branch = (await git(ROOT, 'rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim();
  await git(copy, 'init', '-q', '-b', branch && branch !== 'HEAD' ? branch : 'copia');
  await git(copy, 'add', '-A');
  await git(copy, 'commit', '-q', '-m', 'copia del proyecto para la red');
  // Y con las mismas fases cerradas: la red lee los tags fase-NN-ok (qué fases están cerradas
  // y cuántas pruebas tenían), y sin ellos la copia se comportaría como un proyecto sin historia.
  const closed = (await git(ROOT, 'tag', '--list', 'fase-*-ok')).stdout
    .split(/\r?\n/)
    .filter(Boolean);
  for (const tag of closed) {
    const message = (await git(ROOT, 'tag', '-l', '--format=%(contents)', tag)).stdout.trim();
    await git(copy, 'tag', '-a', tag, '-m', message || 'Fase aprobada.');
  }
  return copy;
}

// Una copia con solo algunos archivos o carpetas del proyecto (y node_modules enlazado), para
// las pruebas que necesitan datos propios sin tocar la carpeta real.
export function minimalCopy(paths: string[]): string {
  const copy = tempFolder('retenia-minima-');
  for (const path of paths) {
    cpSync(join(ROOT, path), join(copy, path), {
      recursive: true,
      // Sin las herramientas bajadas (Opengrep pesa 53 MB) ni cachés.
      filter: (source) => !/[\\/](bin|\.cache)([\\/]|$)/.test(source.slice(ROOT.length)),
    });
  }
  linkNodeModules(copy);
  return copy;
}

export function removeCopy(copy: string): void {
  // Primero el enlace a node_modules, para no tocar nunca el node_modules real.
  rmSync(join(copy, 'node_modules'), { force: true });
  rmSync(copy, { recursive: true, force: true });
}

// Corre la red rápida en una carpeta, aislada (escribe sus informes en una carpeta propia).
export function runNetworkIn(root: string) {
  return run(process.execPath, [join(root, 'tools', 'verify.mjs')], {
    cwd: root,
    env: cleanEnv({ RETENIA_RUN_DIR: join(root, '.cache', 'red', 'aislada') }),
    timeoutMs: 600_000,
  });
}

// Desde la línea de veredicto hasta el final.
export function verdictLines(stdout: string): string[] {
  const lines = stdout.trimEnd().split(/\r?\n/);
  const start = lines.findIndex((l) => /^(VERDE|ROJO) · /.test(l));
  return start === -1 ? [] : lines.slice(start);
}
