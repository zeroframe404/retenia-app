import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EXECUTABLE, expect, reteniaEnv, test } from './apoyo';

// Si la base de datos no se puede abrir, Retenia tiene que terminar sola. Quedar escondida,
// sin ventana, dejaría tomado el candado de la instancia única y no se podría volver a abrir.
// (El aviso en castellano y la recuperación llegan en la Fase 39.)
test('si la base de datos no se puede abrir, Retenia termina en vez de quedar escondida', async ({
  dataDir,
}) => {
  // Un directorio donde Retenia espera el archivo de la base: abrirla falla.
  mkdirSync(join(dataDir, 'retenia.db'));
  const child = spawn(EXECUTABLE, [], { env: reteniaEnv(dataDir), stdio: 'ignore' });
  const outcome = await new Promise<{ ended: boolean; exitCode: number | null }>((done) => {
    const timer = setTimeout(() => done({ ended: false, exitCode: null }), 15_000);
    child.once('exit', (exitCode) => {
      clearTimeout(timer);
      done({ ended: true, exitCode });
    });
  });
  if (!outcome.ended) {
    child.kill();
  }
  expect(outcome.ended, 'Retenia siguió viva sin poder abrir su base').toBe(true);
  expect(outcome.exitCode).not.toBe(0);
});
