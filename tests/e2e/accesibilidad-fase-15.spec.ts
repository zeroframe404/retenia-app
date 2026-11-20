import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { goTo } from './pasos';

// Accesibilidad de las pantallas nuevas de la Fase 15 con axe-core, en claro y en oscuro: Ajustes ›
// «Datos y copias» con la vista previa de una importación (Anki y RemNote, con su lista de
// rechazadas), «Importaciones» con «Ver rechazadas», y la pantalla de la primera vez con
// «Importar exportación».

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SAMPLES = resolve(import.meta.dirname, '../../datos-de-ejemplo');
const SLOW = { timeout: 30_000 };

type AxeRun = (
  context: Document,
  options: object,
) => Promise<{ violations: { id: string; help: string; nodes: unknown[] }[] }>;

async function violationsNow(page: Page): Promise<string[]> {
  await page.evaluate(AXE);
  const found: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const violations = await page.evaluate(async () => {
      const axe = (globalThis as unknown as { axe: { run: AxeRun } }).axe;
      const outcome = await axe.run(document, { resultTypes: ['violations'] });
      return outcome.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`);
    });
    found.push(...violations.map((violation) => `tema ${theme}: ${violation}`));
  }
  return found;
}

async function answerOpen(app: ElectronApplication, path: string) {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [chosen],
    })) as typeof dialog.showOpenDialog;
  }, path);
}

test('accesibilidad: la vista previa de Anki y de RemNote, «Importaciones» y la primera vez con «Importar exportación» no tienen faltas según axe-core, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page, app } = await launchFromStart();
  await goTo(page, 'Ajustes');
  expect(await violationsNow(page), 'datos y copias').toEqual([]);

  await answerOpen(app, resolve(SAMPLES, 'mazo-demo.apkg'));
  await page.getByRole('button', { name: 'Importar de Anki' }).click();
  const preview = page.getByRole('region', { name: 'Vista previa de la importación' });
  await expect(preview.getByText('Entran 3 tarjetas y 5 repasos · Rechazadas: 0')).toBeVisible(
    SLOW,
  );
  expect(await violationsNow(page), 'vista previa de Anki').toEqual([]);
  await preview.getByRole('button', { name: 'Cancelar' }).click();

  await answerOpen(app, resolve(SAMPLES, 'remnote-demo.zip'));
  await page.getByRole('button', { name: 'Importar de RemNote' }).click();
  await expect(
    preview.getByText('12 notas, 8 tarjetas, 1 rechazada (imagen faltante)'),
  ).toBeVisible(SLOW);
  await preview.getByLabel('Materia de destino').selectOption({ label: 'Nueva materia…' });
  await expect(preview.getByLabel('Nombre de la materia nueva')).toBeVisible();
  expect(await violationsNow(page), 'vista previa de RemNote con materia nueva').toEqual([]);
  await preview.getByLabel('Nombre de la materia nueva').fill('Prueba de migración');
  await preview.getByRole('button', { name: 'Importar' }).click();
  await expect(
    page.getByText(/^Listo: entraron 12 notas y 8 tarjetas en «Prueba de migración»/),
  ).toBeVisible(SLOW);
  await expect(page.getByRole('list', { name: 'Lo que no entró' })).toBeVisible();
  expect(await violationsNow(page), 'importaciones con rechazadas').toEqual([]);

  await page.getByRole('button', { name: 'Empezar como la primera vez' }).click();
  await expect(page.getByRole('button', { name: 'Importar exportación' })).toBeVisible(SLOW);
  expect(await violationsNow(page), 'primera vez con importar exportación').toEqual([]);
});
