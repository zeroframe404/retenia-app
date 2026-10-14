import { spawn } from 'node:child_process';
import { EXECUTABLE, expect, reteniaEnv, test } from './apoyo';

// Abre Retenia otra vez, como lo haría el menú Inicio: el mismo ejecutable con la misma carpeta
// de datos. Si hay una instancia, tiene que terminar sola; si abre una ventana más, se queda
// viva y la prueba la corta y falla.
async function openSecondTime(
  dataDir: string,
): Promise<{ exitCode: number | null; ended: boolean }> {
  const child = spawn(EXECUTABLE, [], { env: reteniaEnv(dataDir), stdio: 'ignore' });
  const outcome = await new Promise<{ exitCode: number | null; ended: boolean }>((done) => {
    const timer = setTimeout(() => done({ exitCode: null, ended: false }), 20_000);
    child.once('exit', (exitCode) => {
      clearTimeout(timer);
      done({ exitCode, ended: true });
    });
  });
  if (!outcome.ended) {
    child.kill();
  }
  return outcome;
}

test('[CA-014] abrir Retenia por segunda vez pasa al frente la ventana que ya estaba y no abre otra', async ({
  app,
  appWindow,
  dataDir,
}) => {
  await expect(appWindow.getByRole('heading', { level: 2, name: 'Tarjetas' })).toBeVisible();

  // La ventana está minimizada: «pasar al frente» tiene que devolverla.
  const windowState = () =>
    app.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();
      return { count: BrowserWindow.getAllWindows().length, minimized: window?.isMinimized() };
    });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.minimize());
  await expect.poll(windowState).toEqual({ count: 1, minimized: true });

  const second = await openSecondTime(dataDir);
  expect(second).toEqual({ exitCode: 0, ended: true });

  await expect.poll(windowState).toEqual({ count: 1, minimized: false });
});
