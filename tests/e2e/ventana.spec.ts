import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from './apoyo';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

test('la ventana se llama «Retenia» y muestra la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027»', async ({
  app,
  ventana,
}) => {
  await expect(
    ventana.getByText('DEMOSTRACIÓN · hoy es lunes 15/03/2027', { exact: true }),
  ).toBeVisible();
  await expect(ventana.getByRole('heading', { level: 1, name: 'Retenia' })).toBeVisible();
  await expect(ventana).toHaveTitle('Retenia');
  const tituloDeLaVentana = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => w.getTitle()),
  );
  expect(tituloDeLaVentana).toEqual(['Retenia']);
});

test('la ventana está aislada: sin Node, con sandbox y sin integración de Node', async ({
  app,
  ventana,
}) => {
  await expect(ventana.getByText(/^DEMOSTRACIÓN · hoy es/)).toBeVisible();
  const enLaVentana = await ventana.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    puente: Object.keys(window.retenia),
  }));
  expect(enLaVentana).toEqual({ require: 'undefined', process: 'undefined', puente: ['ping'] });
  // getLastWebPreferences existe en Electron 44 pero no está en sus tipos.
  const preferencias = await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents as unknown as
      | { getLastWebPreferences(): Record<string, unknown> }
      | undefined;
    const prefs = contents?.getLastWebPreferences();
    return {
      contextIsolation: prefs?.contextIsolation,
      nodeIntegration: prefs?.nodeIntegration,
      sandbox: prefs?.sandbox,
      webSecurity: prefs?.webSecurity,
    };
  });
  expect(preferencias).toEqual({
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  });
});

test('el puente rechaza un mensaje que no cumple el contrato del canal «ping»', async ({
  ventana,
}) => {
  await expect(ventana.getByText(/^DEMOSTRACIÓN · hoy es/)).toBeVisible();
  const resultado = await ventana.evaluate(() =>
    window.retenia
      .ping({ message: 'otra cosa' } as unknown as { message: 'ping' })
      .then(() => 'aceptado')
      .catch((error: Error) => error.message),
  );
  expect(resultado).toContain('Petición rechazada en el canal «ping»');
});

test('accesibilidad: la ventana no tiene faltas según axe-core', async ({ ventana }) => {
  await expect(ventana.getByText(/^DEMOSTRACIÓN · hoy es/)).toBeVisible();
  await ventana.evaluate(AXE);
  const faltas = await ventana.evaluate(async () => {
    const axe = (
      globalThis as unknown as {
        axe: {
          run: (
            context: Document,
            options: object,
          ) => Promise<{ violations: { id: string; help: string; nodes: unknown[] }[] }>;
        };
      }
    ).axe;
    const resultado = await axe.run(document, { resultTypes: ['violations'] });
    return resultado.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`);
  });
  expect(faltas).toEqual([]);
});
