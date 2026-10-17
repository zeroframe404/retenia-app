import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { goTo, goToDestination } from './pasos';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

type AxeRun = (
  context: Document,
  options: object,
) => Promise<{ violations: { id: string; help: string; nodes: unknown[] }[] }>;

// Las faltas de accesibilidad que axe-core encuentra en lo que se ve ahora, en claro y en oscuro.
// Sin movimiento: los colores no están a medio cambiar cuando axe los mide.
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

test('accesibilidad: las seis pantallas del riel no tienen faltas según axe-core, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  for (const destination of [
    'Estudiar',
    'Apuntes',
    'Materiales',
    'Idiomas',
    'Progreso',
    'Ajustes',
  ] as const) {
    await goToDestination(page, destination);
    expect(await violationsNow(page), destination).toEqual([]);
  }
});

test('accesibilidad: Apuntes con su lista, el formulario con aviso, la Papelera y la Actividad reciente no tienen faltas según axe-core, en claro y en oscuro', async ({
  launch,
}) => {
  const { page } = await launch();
  expect(await violationsNow(page), 'Tarjetas').toEqual([]);
  await page.getByRole('button', { name: 'Nueva tarjeta' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Escribí la pregunta')).toBeVisible();
  expect(await violationsNow(page), 'formulario con aviso').toEqual([]);
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await goTo(page, 'Papelera');
  expect(await violationsNow(page), 'Papelera vacía').toEqual([]);
  await goTo(page, 'Actividad reciente');
  expect(await violationsNow(page), 'Actividad reciente').toEqual([]);
});

test('accesibilidad: la «Galería» entera, con el panel lateral y el diálogo abiertos, no tiene faltas según axe-core, en claro y en oscuro', async ({
  launch,
}) => {
  const { page } = await launch();
  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: 'Galería' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Galería' })).toBeVisible();
  expect(await violationsNow(page), 'galería').toEqual([]);
  await page.getByRole('button', { name: 'Abrir el diálogo de ejemplo' }).click();
  await expect(page.getByRole('dialog', { name: 'Diálogo de ejemplo' })).toBeVisible();
  expect(await violationsNow(page), 'galería con el diálogo abierto').toEqual([]);
});

test('accesibilidad: el cuadro «Buscar» y Ajustes con «Oscuro» elegido no tienen faltas según axe-core, en claro y en oscuro', async ({
  launch,
}) => {
  const { page } = await launch();
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('dialog', { name: 'Buscar' })).toBeVisible();
  expect(await violationsNow(page), 'buscar').toEqual([]);
  await page.keyboard.press('Escape');
  await goTo(page, 'Ajustes');
  await page.getByRole('radio', { name: 'Oscuro' }).check();
  expect(await violationsNow(page), 'ajustes con «Oscuro»').toEqual([]);
});
