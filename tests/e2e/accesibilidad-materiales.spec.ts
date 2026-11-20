import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { goToDestination } from './pasos';

// Accesibilidad de las pantallas nuevas de la Fase 13 con axe-core, en claro y en oscuro: la lista
// de materiales, «Agregar material», el aviso de duplicado, un material con error, el visor y
// «Crear tarjeta desde acá».

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

test('accesibilidad: Materiales, «Agregar material», el duplicado, el error, el visor y «Crear tarjeta desde acá» no tienen faltas según axe-core, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goToDestination(page, 'Materiales');
  const inference = page
    .getByRole('main')
    .getByRole('button', { name: /Inferencia — capítulos 1 a 4/ });
  await expect(inference).toContainText('Listo', { timeout: 60_000 });
  expect(await violationsNow(page), 'la lista').toEqual([]);

  await page.getByRole('button', { name: 'Agregar material' }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar material' });
  await dialog.getByRole('button', { name: 'Más opciones' }).click();
  expect(await violationsNow(page), 'agregar').toEqual([]);
  await dialog.getByLabel('Elegir archivo').setInputFiles(resolve(SAMPLES, 'Apunte 3.pdf'));
  await expect(page.getByRole('dialog', { name: /^Parece que ya agregaste/ })).toBeVisible();
  expect(await violationsNow(page), 'el duplicado').toEqual([]);
  await page.getByRole('button', { name: 'Abrir el existente' }).click();

  await page.getByRole('button', { name: 'Agregar material' }).click();
  await page
    .getByRole('dialog', { name: 'Agregar material' })
    .getByLabel('Elegir archivo')
    .setInputFiles(resolve(SAMPLES, 'no-es-un-pdf.pdf'));
  await page
    .getByRole('main')
    .getByRole('button', { name: /no-es-un-pdf/ })
    .click();
  await expect(page.getByText('No pudimos leer este PDF (protegido o dañado)')).toBeVisible();
  expect(await violationsNow(page), 'el error').toEqual([]);

  await inference.click();
  await page.getByRole('button', { name: 'Leer el original' }).click();
  await expect(page.getByText(/^Página 1 de 12$/)).toBeVisible();
  expect(await violationsNow(page), 'el visor').toEqual([]);
  const sentence =
    'Una muestra es una parte de la población que se elige para observarla y sacar conclusiones sobre el todo.';
  await page
    .getByText(sentence)
    .first()
    .evaluate((element, text) => {
      const node = element.firstChild as Text;
      const start = node.data.indexOf(text);
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }, sentence);
  await page.getByRole('button', { name: 'Crear tarjeta desde acá' }).click();
  await expect(page.getByRole('dialog', { name: 'Crear tarjeta desde acá' })).toBeVisible();
  expect(await violationsNow(page), 'crear tarjeta').toEqual([]);
});
