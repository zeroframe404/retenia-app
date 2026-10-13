import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  test as base,
  type ElectronApplication,
  _electron as electron,
  type Page,
} from '@playwright/test';

// La variante de prueba compilada por tools/verify.mjs (o por «npm run iniciar»).
const MAIN = resolve(import.meta.dirname, '../../out/prueba/main/index.js');

type Fixtures = { app: ElectronApplication; ventana: Page };

// Cada prueba abre Retenia con su propia carpeta de datos y deja la traza como adjunto.
export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright exige desestructurar los accesorios aunque no se use ninguno.
  app: async ({}, use, testInfo) => {
    const datos = testInfo.outputPath('datos');
    mkdirSync(datos, { recursive: true });
    const env: Record<string, string> = { RETENIA_DATOS: datos };
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE' && key !== 'RETENIA_DATOS') {
        env[key] = value;
      }
    }
    const app = await electron.launch({ args: [MAIN], env });
    await app.context().tracing.start({ screenshots: true, snapshots: true });
    await use(app);
    const traza = testInfo.outputPath('traza.zip');
    await app.context().tracing.stop({ path: traza });
    await testInfo.attach('traza', { path: traza, contentType: 'application/zip' });
    await app.close();
  },
  ventana: async ({ app }, use) => {
    const ventana = await app.firstWindow();
    await ventana.waitForLoadState('domcontentloaded');
    await use(ventana);
  },
});

export { expect } from '@playwright/test';
