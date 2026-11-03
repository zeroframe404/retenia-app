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

// El entorno de un proceso de Retenia: el de esta PC, con una carpeta de datos propia y, si la
// prueba lo pide, las variables de la variante de prueba que usa el Laboratorio (de dónde bajar
// los modelos, el micrófono de prueba).
export function reteniaEnv(
  dataDir: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = { RETENIA_DATOS: dataDir };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE' && key !== 'RETENIA_DATOS') {
      env[key] = value;
    }
  }
  return { ...env, ...extra };
}

interface Launched {
  app: ElectronApplication;
  page: Page;
  // Cierra Retenia como lo haría quien cierra la ventana, dejando antes la traza como adjunto.
  close: () => Promise<void>;
}

// `args` son interruptores de Chromium para quien necesita una pantalla idéntica en cualquier
// máquina (las capturas de referencia) o una escala de Windows distinta.
type Launch = (folder?: string, env?: Record<string, string>, args?: string[]) => Promise<Launched>;

type Fixtures = {
  dataDir: string;
  // Abre Retenia en su pantalla inicial (Estudiar), tal como la ve quien la abre.
  launchFromStart: Launch;
  // Abre Retenia y deja a la vista la lista de tarjetas (Apuntes › «Tarjetas»): donde empezaban las
  // pruebas de las Fases 03 a 05, antes de que existiera el riel y de que Apuntes tuviera notas.
  launch: Launch;
  app: ElectronApplication;
  appWindow: Page;
};

// Apuntes › «Tarjetas», por el riel y por el nombre que se ve (desde la Fase 07 Apuntes abre en
// «Notas»).
async function openCards(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Riel lateral' })
    .getByRole('button', { name: 'Apuntes', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Secciones de Apuntes' })
    .getByRole('button', { name: 'Tarjetas', exact: true })
    .click();
  await page.getByRole('heading', { level: 3, name: 'Tarjetas' }).waitFor();
}

// Cada prueba abre Retenia con su propia carpeta de datos y deja la traza como adjunto.
export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright exige desestructurar los accesorios aunque no se use ninguno.
  dataDir: async ({}, use, testInfo) => {
    const dataDir = testInfo.outputPath('datos');
    mkdirSync(dataDir, { recursive: true });
    await use(dataDir);
  },
  launchFromStart: async ({ dataDir }, use, testInfo) => {
    const open: Launched[] = [];
    let count = 0;
    await use(async (folder = dataDir, env = {}, args = []) => {
      count += 1;
      const app = await electron.launch({
        executablePath: EXECUTABLE,
        args,
        env: reteniaEnv(folder, env),
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
  launch: async ({ launchFromStart }, use) => {
    await use(async (folder, env, args) => {
      const launched = await launchFromStart(folder, env, args);
      await openCards(launched.page);
      return launched;
    });
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
