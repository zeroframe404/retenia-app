import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { goToDestination } from './pasos';

// Accesibilidad de las pantallas nuevas de la Fase 10 con axe-core, en claro y en oscuro: la sesión
// (pregunta, respuesta, menú «Más», la ficha en el panel), el cierre con sus cuadros y Progreso ›
// «Dudas y revisiones».

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

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

test('accesibilidad: la sesión de estudio, el cierre, sus cuadros y Progreso › «Dudas y revisiones» no tienen faltas según axe-core, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goToDestination(page, 'Estudiar');
  await expect(page.getByRole('button', { name: 'Empezar', exact: true })).toBeEnabled();
  expect(await violationsNow(page), 'Estudiar').toEqual([]);
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await expect(page.getByText('PRÁCTICA AUTÓNOMA')).toBeVisible();
  await page.getByPlaceholder('Tu respuesta…').fill('cuánto se alejan');
  await expect(page.getByText('Borrador guardado')).toBeVisible();
  expect(await violationsNow(page), 'la pregunta').toEqual([]);
  await page.getByRole('button', { name: 'Más' }).click();
  expect(await violationsNow(page), 'el menú «Más»').toEqual([]);
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  await expect(page.getByRole('dialog', { name: 'Editar la tarjeta' })).toBeVisible();
  expect(await violationsNow(page), 'la ficha en el panel').toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  expect(await violationsNow(page), 'la respuesta').toEqual([]);
  await page.getByRole('button', { name: 'La sabía', exact: true }).click();
  expect(await violationsNow(page), 'después de calificar').toEqual([]);
  for (let step = 1; step < 10; step += 1) {
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await page
      .getByRole('button', { name: step === 1 ? 'No la sabía' : 'La sabía', exact: true })
      .click();
  }
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: 'La sabía', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Sesión terminada/ })).toBeVisible();
  expect(await violationsNow(page), 'el cierre').toEqual([]);
  await page.getByRole('button', { name: 'Guardar una duda' }).click();
  expect(await violationsNow(page), 'la duda').toEqual([]);
  await page
    .getByRole('dialog', { name: 'Guardar una duda' })
    .getByLabel('Tu duda')
    .fill('Una duda');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Ajustar el plan' }).click();
  expect(await violationsNow(page), 'ajustar el plan').toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Terminar' }).click();
  await goToDestination(page, 'Progreso');
  await expect(page.getByText('Una duda')).toBeVisible();
  expect(await violationsNow(page), 'Progreso').toEqual([]);
});
