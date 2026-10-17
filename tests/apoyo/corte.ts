import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';
import { ROOT } from '../../tools/lib/proceso.mjs';
import { cleanEnv } from './red';

// La prueba del corte (CA-017) corre una escritura real de Retenia en un proceso aparte y lo
// mata en el punto pedido. El programa hijo importa src/data, que usa import.meta.glob (solo
// existe dentro de Vite) e importaciones sin extensión: Vite lo arma una vez por corrida.

export interface CutChild {
  script: string;
  remove: () => void;
}

export async function buildCutChild(): Promise<CutChild> {
  // Dentro del proyecto, para que el hijo encuentre node_modules (better-sqlite3).
  const outDir = join(ROOT, '.cache', 'pruebas', `corte-${randomUUID()}`);
  await build({
    root: ROOT,
    configFile: false,
    logLevel: 'silent',
    build: {
      ssr: 'tests/apoyo/escritura-cortada.ts',
      outDir,
      emptyOutDir: true,
      minify: false,
      target: 'node24',
    },
  });
  return {
    script: join(outDir, 'escritura-cortada.js'),
    remove: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

export interface CutOutcome {
  // Terminó la escritura (y cerró la base) sin que nadie lo cortara.
  done: boolean;
  statements: number;
  stderr: string;
}

export function runCut(
  child: CutChild,
  file: string,
  operation: string,
  cutAt: number,
  data: Record<string, string>,
): Promise<CutOutcome> {
  return new Promise((resolve) => {
    const running = spawn(
      process.execPath,
      [child.script, file, operation, String(cutAt), JSON.stringify(data)],
      { env: cleanEnv(), windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    running.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    running.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    running.on('close', () => {
      const outcome = stdout.trim() === '' ? null : (JSON.parse(stdout) as { statements: number });
      resolve({ done: outcome !== null, statements: outcome?.statements ?? 0, stderr });
    });
  });
}
