import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  test as base,
  type ElectronApplication,
  _electron as electron,
  type Page,
} from '@playwright/test';

// La variante de prueba compilada por la red (o por «npm run iniciar»).
const MAIN = resolve(import.meta.dirname, '../../out/prueba/main/index.js');

type Fixtures = { app: ElectronApplication; appWindow: Page };

// Cada prueba abre Retenia con su propia carpeta de datos y deja la traza como adjunto.
export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright exige desestructurar los accesorios aunque no se use ninguno.
  app: async ({}, use, testInfo) => {
    const dataDir = testInfo.outputPath('datos');
    mkdirSync(dataDir, { recursive: true });
    const env: Record<string, string> = { RETENIA_DATOS: dataDir };
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE' && key !== 'RETENIA_DATOS') {
        env[key] = value;
      }
    }
    const app = await electron.launch({ args: [MAIN], env });
    await app.context().tracing.start({ screenshots: true, snapshots: true });
    await use(app);
    const trace = testInfo.outputPath('traza.zip');
    await app.context().tracing.stop({ path: trace });
    await testInfo.attach('traza', { path: trace, contentType: 'application/zip' });
    await app.close();
  },
  appWindow: async ({ app }, use) => {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await use(window);
  },
});

export { expect } from '@playwright/test';
