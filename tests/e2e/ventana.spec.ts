import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from './apoyo';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

test('la ventana se llama «Retenia» y muestra la cinta «DEMOSTRACIÓN · hoy es lunes 15/03/2027»', async ({
  app,
  appWindow,
}) => {
  await expect(
    appWindow.getByText('DEMOSTRACIÓN · hoy es lunes 15/03/2027', { exact: true }),
  ).toBeVisible();
  await expect(appWindow.getByRole('heading', { level: 1, name: 'Retenia' })).toBeVisible();
  await expect(appWindow).toHaveTitle('Retenia');
  const windowTitles = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => w.getTitle()),
  );
  expect(windowTitles).toEqual(['Retenia']);
});

test('la ventana está aislada: sin Node, con sandbox y sin integración de Node', async ({
  app,
  appWindow,
}) => {
  await expect(appWindow.getByText(/^DEMOSTRACIÓN · hoy es/)).toBeVisible();
  const inWindow = await appWindow.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    bridge: Object.keys(window.retenia),
  }));
  // El puente expone exactamente los canales del contrato más los de demostración, que solo
  // existen en esta variante (docs/arquitectura.md, sección 3).
  expect(inWindow).toEqual({
    require: 'undefined',
    process: 'undefined',
    bridge: [
      'ping',
      'app.info',
      'cards.create',
      'cards.list',
      'cards.review',
      'cards.edit',
      'cards.history',
      'demo.state',
    ],
  });
  // getLastWebPreferences existe en Electron 44 pero no está en sus tipos.
  const preferences = await app.evaluate(({ BrowserWindow }) => {
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
  expect(preferences).toEqual({
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  });
});

test('el puente rechaza un mensaje que no cumple el contrato del canal «ping»', async ({
  appWindow,
}) => {
  await expect(appWindow.getByText(/^DEMOSTRACIÓN · hoy es/)).toBeVisible();
  const result = await appWindow.evaluate(() =>
    window.retenia
      .ping({ message: 'otra cosa' } as unknown as { message: 'ping' })
      .then(() => 'aceptado')
      .catch((error: Error) => error.message),
  );
  expect(result).toContain('Petición rechazada en el canal «ping»');
});

test('accesibilidad: la ventana no tiene faltas según axe-core, en claro y en oscuro', async ({
  appWindow,
}) => {
  await expect(appWindow.getByText(/^DEMOSTRACIÓN · hoy es/)).toBeVisible();
  await appWindow.evaluate(AXE);
  for (const theme of ['light', 'dark'] as const) {
    await appWindow.emulateMedia({ colorScheme: theme });
    const violations = await appWindow.evaluate(async () => {
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
      const outcome = await axe.run(document, { resultTypes: ['violations'] });
      return outcome.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`);
    });
    expect(violations, `tema ${theme}`).toEqual([]);
  }
});
