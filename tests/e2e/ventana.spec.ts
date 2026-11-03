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
      // La apariencia (Fase 06).
      'appearance.get',
      'appearance.set',
      'cards.create',
      'cards.list',
      'cards.review',
      'cards.edit',
      'cards.history',
      'cards.delete',
      // Materias, temas, notas, imágenes y Bandeja (Fase 07).
      'subjects.list',
      'subjects.create',
      'subjects.activate',
      'subjects.createExample',
      'topics.list',
      'topics.create',
      'topics.rename',
      'topics.archive',
      'topics.unarchive',
      'topics.delete',
      'notes.list',
      'notes.create',
      'notes.get',
      'notes.save',
      'notes.move',
      'notes.archive',
      'notes.unarchive',
      'notes.delete',
      'notes.titles',
      'notes.mentions',
      'images.save',
      'images.read',
      'inbox.list',
      'inbox.capture',
      'inbox.move',
      'inbox.delete',
      'trash.list',
      'trash.listOrganization',
      'trash.restore',
      'trash.empty',
      'activity.recent',
      'activity.undo',
      'backups.list',
      'backups.createNow',
      'backups.restore',
      'backups.verifyData',
      'backups.repairData',
      'backups.openFolder',
      // El zoom con el teclado (Fase 06).
      'window.zoom',
      // El aviso de que la pantalla guardó antes de cerrar (Fase 07).
      'window.flushed',
      'demo.state',
      'demo.advanceDays',
      'demo.resetDate',
      // «Empezar como la primera vez» y «Volver al elenco» (Fase 07).
      'demo.dataMode',
      'demo.useFirstTime',
      'demo.useCast',
      // «Simular sin conexión» y el Laboratorio (Fase 05).
      'demo.connection',
      'demo.setConnection',
      'demo.lab.modelsStatus',
      'demo.lab.downloadModels',
      'demo.lab.speak',
      'demo.lab.microphone',
      'demo.lab.openMicrophoneSettings',
      'demo.lab.transcribe',
      'demo.lab.readPdf',
      'demo.lab.ocrPage',
      'demo.lab.notify',
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
    // Sin movimiento: los colores no están a medio cambiar cuando axe los mide (Fase 06).
    await appWindow.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
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
