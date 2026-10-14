// Freno de cierre (gancho Stop de Claude Code, CA-007). Al terminar un turno: si el proyecto
// cambió desde la última corrida verde, corre «npm run verificar». Si da ROJO, frena el cierre
// con código 2 y manda el resumen por la salida de error, para que Claude siga trabajando.
// El segundo intento (stop_hook_active) pasa siempre, para no entrar en un círculo sin fin.
// Si el freno mismo no puede arrancar, también frena: nunca deja cerrar sin comprobar.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readHookInput } from '../lib/gancho.mjs';

const input = await readHookInput();
if (input.stop_hook_active === true) {
  process.exit(0);
}

/** @param {string} reason @param {string} detail */
function block(reason, detail) {
  console.error(
    `Freno de cierre: ${reason} No des la tarea por terminada: arreglá lo que sigue, corré «npm run verificar» hasta ver VERDE y recién después cerrá el turno.\n\n${detail}`.trim(),
  );
  process.exit(2);
}

try {
  const { projectFingerprint } = await import('../lib/archivos.mjs');
  const { ROOT, run } = await import('../lib/proceso.mjs');

  const lastGreen = join(ROOT, '.cache', 'red', 'ultima-verde.json');
  const fingerprint = await projectFingerprint(ROOT);
  if (existsSync(lastGreen)) {
    try {
      if (JSON.parse(readFileSync(lastGreen, 'utf8')).fingerprint === fingerprint) {
        process.exit(0);
      }
    } catch {
      // Si el archivo está dañado, se corre la red.
    }
  }

  const env = { ...process.env };
  delete env.RETENIA_RUN_DIR;
  const r = await run(process.execPath, [join(ROOT, 'tools', 'verify.mjs')], {
    env,
    timeoutMs: 600_000,
  });
  if (r.code === 0) {
    process.exit(0);
  }
  const lines = r.stdout.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith('ROJO ·'));
  block(
    'la red quedó en ROJO después de tus cambios.',
    (start === -1 ? lines.slice(-40) : lines.slice(start)).join('\n').trim(),
  );
} catch (error) {
  block(
    'no pude correr la red para comprobar tus cambios.',
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
}
