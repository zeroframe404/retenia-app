import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { advanceDemoDate, goTo, itemWith } from './pasos';

// Accesibilidad de las pantallas nuevas de la Fase 16 con axe-core, en claro y en oscuro: el
// ejercicio con la barra de ayuda y el panel de pistas, la pregunta antes de la solución, el
// resultado de la respuesta abierta con sus casillas y el menú de «Discrepo», la diferencia letra por
// letra, el aviso de evaluación corregida, las opciones con la explicación de la equivocada, ordenar
// pasos, el historial con la calificación tachada y el editor de «Nuevo ejercicio».

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const OPEN =
  'Un intervalo de confianza del 95 % para la media es [4,2; 5,8]. ¿Qué significa ese 95 %?';

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

async function practice(page: Page, question: string) {
  await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('exercise');
  await itemWith(page, question).getByRole('button', { name: 'Practicar ahora' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Ejercicio' })).toBeVisible();
}

const resultOf = (page: Page) => page.locator('[data-component="result"]');

test('accesibilidad: el ejercicio con pistas, la pregunta antes de la solución, el resultado con «Discrepo», la diferencia letra por letra, el aviso corregido, opciones, ordenar pasos, el historial y el editor no tienen faltas según axe-core, en claro y en oscuro', async ({
  launch,
}) => {
  const { page } = await launch();
  await advanceDemoDate(page, '+1 día');
  await goTo(page, 'Tarjetas');

  await practice(page, OPEN);
  expect(await violationsNow(page), 'ejercicio sin empezar').toEqual([]);
  await page.getByPlaceholder('Tu respuesta…').fill('Habla del método');
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: 'Pista' }).click();
  }
  await expect(page.getByRole('complementary', { name: 'Pistas' })).toBeVisible();
  expect(await violationsNow(page), 'panel de pistas').toEqual([]);
  await page.getByRole('button', { name: 'Pista' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Intentarlo una vez más' })).toBeVisible();
  expect(await violationsNow(page), 'pregunta antes de la solución').toEqual([]);
  await dialog.getByRole('button', { name: 'Intentarlo una vez más' }).click();
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.getByRole('checkbox', { name: 'La cubrí: idea 1' }).check();
  await page.getByRole('button', { name: 'Discrepo' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  expect(await violationsNow(page), 'resultado abierto con «Discrepo»').toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Siguiente' }).click();

  await practice(page, 'Capital de Francia');
  await page.getByPlaceholder('Tu respuesta…').fill('Paría');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(resultOf(page).getByText('Todavía no.', { exact: true })).toBeVisible();
  expect(await violationsNow(page), 'diferencia letra por letra').toEqual([]);
  await page.getByRole('button', { name: 'Discrepo' }).click();
  await page.getByRole('menuitem', { name: 'Mi respuesta era correcta' }).click();
  const notice = page.locator('[data-component="corrected-evaluation"]');
  await expect(notice.getByText('Todavía no → Correcto')).toBeVisible();
  expect(await violationsNow(page), 'aviso de evaluación corregida').toEqual([]);
  await notice.getByRole('button', { name: 'Deshacer' }).click();
  await expect(resultOf(page).getByText('Todavía no.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();

  await practice(page, '¿Qué medida de centro cambia menos si aparece un valor extremo?');
  await page.getByRole('radio', { name: 'La media', exact: true }).check();
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(resultOf(page).getByText('Todavía no.', { exact: true })).toBeVisible();
  expect(await violationsNow(page), 'opciones con la explicación').toEqual([]);
  await page.getByRole('button', { name: 'Siguiente' }).click();

  await practice(page, 'Ordená los pasos para encontrar la mediana de 7, 3 y 5');
  expect(await violationsNow(page), 'ordenar pasos').toEqual([]);
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(resultOf(page)).toBeVisible();
  expect(await violationsNow(page), 'ordenar pasos enviado').toEqual([]);
  await page.getByRole('button', { name: 'Siguiente' }).click();

  await itemWith(page, 'Capital de Francia')
    .getByRole('button', { name: /^Abrir la tarjeta/ })
    .click();
  await page.getByRole('button', { name: 'Historial' }).click();
  await expect(
    page.getByRole('list', { name: 'Repasos de la tarjeta' }).locator('del').first(),
  ).toBeVisible();
  expect(await violationsNow(page), 'historial con la calificación tachada').toEqual([]);

  await goTo(page, 'Tarjetas');
  await page.getByRole('button', { name: 'Nuevo ejercicio' }).click();
  await page.getByLabel('Tipo de actividad').selectOption({ label: 'Opciones' });
  expect(await violationsNow(page), 'editor de opciones').toEqual([]);
  await page.getByLabel('Tipo de actividad').selectOption({ label: 'Ordenar pasos' });
  expect(await violationsNow(page), 'editor de pasos').toEqual([]);
  await page.getByLabel('Tipo de actividad').selectOption({ label: 'Respuesta abierta' });
  expect(await violationsNow(page), 'editor de ideas').toEqual([]);
});
