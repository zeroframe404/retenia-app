import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { goToDestination } from './pasos';

// Accesibilidad de las pantallas nuevas de la Fase 17 con axe-core, en claro y en oscuro: Progreso
// con sus objetivos, el cuadro «Nuevo objetivo», el panel de evidencias con sus requisitos, «Mis
// errores», «Mejorar la tarjeta» con «Dividir en dos» y Estudiar con «Antes conviene».

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

const CALCULATE = 'Calcular la media y el desvío';

test('accesibilidad: Progreso (objetivos, «Nuevo objetivo», el panel, «Mis errores», «Mejorar la tarjeta» y «Dividir en dos») y Estudiar con un requisito no tienen faltas según axe-core, en claro y en oscuro', async ({
  launch,
}) => {
  test.setTimeout(120_000);
  const { page } = await launch();
  await goToDestination(page, 'Progreso');
  await expect(
    page.getByRole('heading', { name: 'Objetivos de Estadística básica' }),
  ).toBeVisible();
  expect(await violationsNow(page), 'Objetivos').toEqual([]);

  await page.getByRole('button', { name: 'Nuevo objetivo' }).click();
  const form = page.getByRole('dialog', { name: 'Nuevo objetivo' });
  await expect(form.getByLabel('Texto', { exact: true })).toBeVisible();
  await form.getByLabel('Texto', { exact: true }).fill('Interpretar un intervalo de confianza');
  await form.getByLabel('Tema', { exact: true }).selectOption({ label: 'Intervalos de confianza' });
  await expect(form.getByRole('checkbox').first()).toBeVisible();
  expect(await violationsNow(page), 'Nuevo objetivo').toEqual([]);
  await form.getByRole('button', { name: 'Crear objetivo' }).click();
  await expect(form).toBeHidden();

  await page.getByRole('button', { name: CALCULATE, exact: true }).click();
  const panel = page.getByRole('dialog', { name: CALCULATE });
  await expect(panel.getByRole('region', { name: 'Evidencias' })).toBeVisible();
  expect(await violationsNow(page), 'el panel').toEqual([]);
  await panel.getByRole('button', { name: 'Marcar como requisito de…' }).click();
  await expect(panel.getByLabel('Objetivo', { exact: true })).toBeVisible();
  expect(await violationsNow(page), 'el requisito').toEqual([]);
  await panel.getByRole('button', { name: 'Guardar' }).click();
  await expect(panel.getByRole('region', { name: 'Es requisito de' })).toBeVisible();
  await page.keyboard.press('Escape');

  const sections = page.getByRole('navigation', { name: 'Secciones de Progreso' });
  await sections.getByRole('button', { name: 'Mis errores' }).click();
  await expect(page.getByText(/^Todavía no hay errores anotados/)).toBeVisible();
  expect(await violationsNow(page), 'Mis errores').toEqual([]);

  await sections.getByRole('button', { name: 'Mejorar la tarjeta' }).click();
  await expect(page.getByRole('list', { name: 'Mejorar la tarjeta' })).toBeVisible();
  expect(await violationsNow(page), 'Mejorar la tarjeta').toEqual([]);
  await page.getByRole('button', { name: 'Dividir en dos' }).click();
  await expect(page.getByRole('dialog', { name: 'Dividir en dos' })).toBeVisible();
  expect(await violationsNow(page), 'Dividir en dos').toEqual([]);
  await page.keyboard.press('Escape');

  await goToDestination(page, 'Estudiar');
  await expect(page.getByRole('note', { name: 'Requisito' })).toBeVisible();
  expect(await violationsNow(page), 'Estudiar con un requisito').toEqual([]);
});
