import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { goTo, itemWith, review } from './pasos';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

type AxeRun = (
  context: Document,
  options: object,
) => Promise<{ violations: { id: string; help: string; nodes: unknown[] }[] }>;

// Las faltas de accesibilidad que axe-core encuentra en lo que se ve ahora, en claro y en oscuro.
async function violationsNow(page: Page): Promise<string[]> {
  const found: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    // Sin movimiento: los colores no están a medio cambiar cuando axe los mide (Fase 06).
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

test('accesibilidad: el historial, editar, la papelera con su confirmación, la actividad reciente, datos y copias y la demostración no tienen faltas según axe-core, en claro y en oscuro', async ({
  appWindow,
}) => {
  const question = '¿Qué mide el desvío estándar?';
  await expect(appWindow.getByRole('heading', { level: 3, name: 'Tarjetas' })).toBeVisible();
  await appWindow.evaluate(AXE);
  expect(await violationsNow(appWindow), 'tarjetas con sus botones').toEqual([]);

  await review(appWindow, question, 'La sabía');
  await itemWith(appWindow, question).getByRole('button', { name: 'Historial' }).click();
  await expect(appWindow.getByRole('heading', { name: 'Historial' })).toBeVisible();
  expect(await violationsNow(appWindow), 'historial').toEqual([]);
  await appWindow.getByRole('button', { name: 'Volver a las tarjetas' }).click();

  await itemWith(appWindow, question).getByRole('button', { name: 'Editar' }).click();
  await expect(appWindow.getByRole('heading', { name: 'Editar tarjeta' })).toBeVisible();
  expect(await violationsNow(appWindow), 'editar').toEqual([]);
  await appWindow.getByRole('button', { name: 'Cancelar' }).click();

  await itemWith(appWindow, question).getByRole('button', { name: 'Eliminar' }).click();
  await expect(appWindow.getByText('La tarjeta está en la Papelera.')).toBeVisible();
  expect(await violationsNow(appWindow), 'lista con el aviso de la papelera').toEqual([]);

  await goTo(appWindow, 'Papelera');
  expect(await violationsNow(appWindow), 'papelera').toEqual([]);
  await appWindow.getByRole('button', { name: 'Vaciar papelera' }).click();
  await expect(
    appWindow.getByText('Las tarjetas de la papelera se eliminan para siempre.'),
  ).toBeVisible();
  expect(await violationsNow(appWindow), 'papelera: confirmación').toEqual([]);
  await appWindow.getByRole('button', { name: 'Cancelar' }).click();

  await goTo(appWindow, 'Actividad reciente');
  expect(await violationsNow(appWindow), 'actividad reciente').toEqual([]);

  await goTo(appWindow, 'Ajustes');
  await appWindow.getByRole('button', { name: 'Verificar datos' }).click();
  await expect(appWindow.getByText('Todo en orden · 0 diferencias')).toBeVisible();
  await appWindow.getByRole('button', { name: 'Hacer copia ahora' }).click();
  await expect(appWindow.getByText('Copia hecha y verificada.')).toBeVisible({ timeout: 20_000 });
  expect(await violationsNow(appWindow), 'datos y copias con la demostración').toEqual([]);
});
