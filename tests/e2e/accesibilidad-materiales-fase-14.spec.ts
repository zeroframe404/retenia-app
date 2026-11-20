import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { goToDestination } from './pasos';

// Accesibilidad de las pantallas nuevas de la Fase 14 con axe-core, en claro y en oscuro: la
// Revisión con sus tres bloques, la corrección de un texto con el aviso de las tarjetas, el mapa de
// cobertura, «Agregar material» con la dirección web y la instantánea de una página web.

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const SAMPLES = resolve(import.meta.dirname, '../../datos-de-ejemplo');

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

test('accesibilidad: la Revisión, la corrección, el mapa de cobertura, la dirección web y la instantánea no tienen faltas según axe-core, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goToDestination(page, 'Materiales');
  const main = page.getByRole('main');
  const inference = main.getByRole('button', { name: /Inferencia — capítulos 1 a 4/ });
  await expect(inference).toContainText('Listo', { timeout: 90_000 });
  await inference.click();
  await page.getByRole('button', { name: 'Revisión' }).click();
  await expect(page.getByRole('heading', { name: 'Con problemas (2)' })).toBeVisible();
  expect(await violationsNow(page), 'la revisión').toEqual([]);

  const first = page
    .getByRole('region', { name: /Con problemas/ })
    .getByRole('listitem')
    .first();
  await first.getByRole('button', { name: 'Corregir texto' }).click();
  expect(await violationsNow(page), 'el editor de la corrección').toEqual([]);
  const field = first.getByRole('textbox', { name: 'Texto corregido' });
  await field.fill((await field.inputValue()).replace('2,228', '2,229'));
  await first.getByRole('button', { name: 'Guardar corrección' }).click();
  await expect(page.getByText('2 tarjetas usan este texto. ¿Actualizarlas?')).toBeVisible();
  expect(await violationsNow(page), 'el aviso de las tarjetas').toEqual([]);
  await page.getByRole('button', { name: 'Ahora no' }).click();

  await page.getByRole('button', { name: 'Mapa de cobertura' }).click();
  await expect(page.getByRole('list', { name: 'Páginas del material' })).toBeVisible();
  expect(await violationsNow(page), 'el mapa de cobertura').toEqual([]);

  await page.getByRole('button', { name: 'Volver al material' }).click();
  await page.getByRole('button', { name: 'Agregar material' }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar material' });
  await dialog.getByRole('button', { name: 'Dirección web' }).click();
  expect(await violationsNow(page), 'la dirección web').toEqual([]);
  await dialog.getByRole('button', { name: 'Elegir archivo' }).click();
  await dialog.getByLabel('Elegir archivo').setInputFiles(resolve(SAMPLES, 'pagina.html'));
  const web = main.getByRole('button', { name: /teorema central/ });
  await expect(web).toContainText('Listo', { timeout: 60_000 });
  await web.click();
  await page.getByRole('button', { name: 'Leer el original' }).click();
  await page.getByRole('button', { name: 'Instantánea' }).click();
  await expect(page.locator('iframe')).toBeVisible();
  expect(await violationsNow(page), 'la instantánea').toEqual([]);
});
