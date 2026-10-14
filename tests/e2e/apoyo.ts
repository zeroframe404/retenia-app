import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  test as base,
  type ElectronApplication,
  _electron as electron,
  type Page,
} from '@playwright/test';

// «Retenia (prueba)» tal como se instala, pero sin instalar: la carpeta win-unpacked que arma
// «npm run construir» (o la red, en verificar:todo). Así la punta a punta ve el mismo archivo
// empaquetado que después se entrega: el módulo nativo de la base, las migraciones adentro del
// archivo principal y los fuses de seguridad.
export const EXECUTABLE = resolve(
  import.meta.dirname,
  '../../release/prueba/win-unpacked/Retenia (prueba).exe',
);

// El entorno de un proceso de Retenia: el de esta PC, con una carpeta de datos propia.
export function reteniaEnv(dataDir: string): Record<string, string> {
  const env: Record<string, string> = { RETENIA_DATOS: dataDir };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE' && key !== 'RETENIA_DATOS') {
      env[key] = value;
    }
  }
  return env;
}

export interface Launched {
  app: ElectronApplication;
  page: Page;
  // Cierra Retenia como lo haría quien cierra la ventana, dejando antes la traza como adjunto.
  close: () => Promise<void>;
}

type Fixtures = {
  dataDir: string;
  launch: (folder?: string) => Promise<Launched>;
  app: ElectronApplication;
  appWindow: Page;
};

// Cada prueba abre Retenia con su propia carpeta de datos y deja la traza como adjunto.
export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright exige desestructurar los accesorios aunque no se use ninguno.
  dataDir: async ({}, use, testInfo) => {
    const dataDir = testInfo.outputPath('datos');
    mkdirSync(dataDir, { recursive: true });
    await use(dataDir);
  },
  launch: async ({ dataDir }, use, testInfo) => {
    const open: Launched[] = [];
    let count = 0;
    await use(async (folder = dataDir) => {
      count += 1;
      const app = await electron.launch({
        executablePath: EXECUTABLE,
        args: [],
        env: reteniaEnv(folder),
      });
      await app.context().tracing.start({ screenshots: true, snapshots: true });
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      let closed = false;
      const launched: Launched = {
        app,
        page,
        close: async () => {
          if (closed) {
            return;
          }
          closed = true;
          const trace = testInfo.outputPath(`traza-${count}-${open.indexOf(launched) + 1}.zip`);
          await app.context().tracing.stop({ path: trace });
          await testInfo.attach(`traza ${open.indexOf(launched) + 1}`, {
            path: trace,
            contentType: 'application/zip',
          });
          await app.close();
        },
      };
      open.push(launched);
      return launched;
    });
    for (const launched of open) {
      await launched.close().catch(() => undefined);
    }
  },
  app: async ({ launch }, use) => {
    await use((await launch()).app);
  },
  appWindow: async ({ app }, use) => {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },
});

export { expect } from '@playwright/test';
