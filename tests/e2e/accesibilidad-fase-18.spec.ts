import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { advanceDemoDate, goTo, goToDestination } from './pasos';

// Accesibilidad de las pantallas nuevas de la Fase 18 con axe-core, en claro y en oscuro: el ejemplo
// completo, el paso vacío con su error y su corrección, el cierre con la propuesta del
// micro-ejercicio y un ítem corregido, la decisión con su porqué, un problema del conjunto, «Mis
// errores» con la tarjeta de contraste y el editor de los tipos nuevos.

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

async function practiceByName(page: Page, name: string) {
  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog', { name: 'Buscar' });
  await dialog.getByRole('combobox', { name: /Buscar/ }).fill(name);
  await expect(dialog.getByRole('option').first()).toContainText(name.slice(0, 20));
  await dialog.getByRole('button', { name: 'Practicar ahora' }).click();
}

const PROCEDURE = 'Calcular un intervalo de confianza para la media';

test('accesibilidad: el procedimiento y el micro-ejercicio no tienen faltas según axe-core, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  for (let day = 0; day < 2; day += 1) {
    await practiceByName(page, PROCEDURE);
    await expect(page.getByRole('textbox', { name: '¿Por qué este paso?' })).toBeVisible();
    if (day === 0) {
      expect(await violationsNow(page), 'el ejemplo completo').toEqual([]);
    }
    await page.getByRole('textbox', { name: '¿Por qué este paso?' }).fill('Porque sí.');
    await page.getByRole('button', { name: 'Terminar el ejemplo' }).click();
    await page.getByRole('button', { name: 'Terminar', exact: true }).click();
    await advanceDemoDate(page, '+1 día');
  }
  await practiceByName(page, PROCEDURE);
  for (let problem = 0; problem < 2; problem += 1) {
    await page.getByRole('textbox', { name: 'Paso 4: tu resultado' }).fill('999');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('Hay un error en el paso 4; ¿lo encontrás?')).toBeVisible();
    if (problem === 0) {
      expect(await violationsNow(page), 'el error señalado').toEqual([]);
    }
    await page.getByRole('button', { name: 'Ver la corrección' }).click();
    await page.getByRole('button', { name: 'Ver el resultado' }).click();
    await expect(page.locator('[data-component="result"]')).toBeVisible();
    if (problem === 0) {
      expect(await violationsNow(page), 'la corrección y el resultado').toEqual([]);
      await page.getByRole('button', { name: 'Otro problema' }).click();
    }
  }
  await page.getByRole('button', { name: 'Terminar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hacer el micro-ejercicio' })).toBeVisible();
  expect(await violationsNow(page), 'el cierre con la propuesta').toEqual([]);
  await page.getByRole('button', { name: 'Hacer el micro-ejercicio' }).click();
  await page.getByRole('textbox', { name: 'Tu resultado' }).fill('1');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByRole('button', { name: 'Siguiente' })).toBeVisible();
  expect(await violationsNow(page), 'un ítem corregido').toEqual([]);
});

test('accesibilidad: la decisión, el conjunto, «Mis errores» con el contraste y el editor nuevo no tienen faltas según axe-core', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await practiceByName(page, 'Una tienda quiere saber qué talle');
  await page.getByRole('radio', { name: 'La media', exact: true }).check();
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByRole('heading', { name: 'El porqué de cada método' })).toBeVisible();
  expect(await violationsNow(page), 'la decisión').toEqual([]);
  await page.getByRole('button', { name: 'Siguiente' }).click();

  await practiceByName(page, 'Media, mediana y moda');
  await expect(page.getByText('Media, mediana y moda · Problema 1 de 9')).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Tu respuesta, con coma o con punto' }),
  ).toBeVisible();
  expect(await violationsNow(page), 'un problema del conjunto').toEqual([]);

  await goToDestination(page, 'Progreso');
  await page
    .getByRole('navigation', { name: 'Secciones de Progreso' })
    .getByRole('button', { name: 'Mis errores' })
    .click();
  await page.getByRole('button', { name: 'Crear tarjeta de contraste' }).first().click();
  await expect(page.getByText(/^Tarjeta creada: /)).toBeVisible();
  expect(await violationsNow(page), '«Mis errores» con el contraste').toEqual([]);

  await goTo(page, 'Tarjetas');
  await page.getByRole('button', { name: 'Nuevo ejercicio' }).click();
  const type = page.getByRole('combobox', { name: 'Tipo de actividad' });
  await type.selectOption('procedure');
  await page.getByRole('checkbox', { name: 'Con variantes (números que cambian)' }).check();
  expect(await violationsNow(page), 'el editor del procedimiento').toEqual([]);
  await type.selectOption('decision');
  expect(await violationsNow(page), 'el editor de la decisión').toEqual([]);
  await type.selectOption('interleaved');
  await expect(page.getByRole('checkbox', { name: /^Cinco amigos/ }).first()).toBeVisible();
  expect(await violationsNow(page), 'el editor del conjunto').toEqual([]);
});
