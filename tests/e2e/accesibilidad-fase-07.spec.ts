import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import {
  editor,
  goTo,
  goToDestination,
  itemWith,
  openNote,
  openNotes,
  openSubjects,
} from './pasos';

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

test('accesibilidad: Estudiar con la materia activa y el cuadro «Cambiar» (con «Nueva materia») no tienen faltas según axe-core, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goToDestination(page, 'Estudiar');
  expect(await violationsNow(page), 'Estudiar').toEqual([]);
  const dialog = await openSubjects(page);
  expect(await violationsNow(page), 'materias').toEqual([]);
  await dialog.getByRole('button', { name: 'Nueva materia' }).click();
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await expect(dialog.getByText('Escribí el nombre de la materia')).toBeVisible();
  expect(await violationsNow(page), 'materias con aviso').toEqual([]);
});

test('accesibilidad: Apuntes › «Notas» con cada selección y sus cuadros no tienen faltas según axe-core, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openNotes(page);
  expect(await violationsNow(page), 'todas las notas').toEqual([]);
  await openNotes(page, 'Media y dispersión');
  expect(await violationsNow(page), 'un tema').toEqual([]);
  await page.getByRole('button', { name: 'Detalles' }).click();
  expect(await violationsNow(page), 'detalles del tema').toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Renombrar' }).click();
  expect(await violationsNow(page), 'renombrar el tema').toEqual([]);
  await page.keyboard.press('Escape');
  await openNotes(page, 'Sin tema');
  expect(await violationsNow(page), 'sin tema').toEqual([]);
  await openNotes(page, 'Todas las notas');
  await itemWith(page, 'Media y desvío').getByRole('button', { name: 'Mover a…' }).click();
  expect(await violationsNow(page), 'mover a').toEqual([]);
  await page.keyboard.press('Escape');
  await itemWith(page, 'Media y desvío').getByRole('button', { name: 'Archivar' }).click();
  expect(await violationsNow(page), 'con el cartel de deshacer').toEqual([]);
  await openNotes(page, 'Archivadas');
  expect(await violationsNow(page), 'archivadas').toEqual([]);
  await openNotes(page);
  await page.getByRole('button', { name: 'Nuevo tema' }).click();
  expect(await violationsNow(page), 'nuevo tema').toEqual([]);
});

test('accesibilidad: el editor con fórmula, imagen y enlace, la lista de enlaces y «Mencionada en» no tienen faltas según axe-core, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openNotes(page);
  await openNote(page, 'Intervalos de confianza');
  await expect(editor(page).locator('.katex')).toBeVisible();
  expect(await violationsNow(page), 'nota del elenco').toEqual([]);
  await page.getByRole('button', { name: 'Mencionada en' }).click();
  await expect(page.getByRole('list', { name: 'Renglones que la mencionan' })).toBeVisible();
  expect(await violationsNow(page), 'mencionada en').toEqual([]);
  await editor(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[[Media');
  await expect(page.getByRole('listbox', { name: 'Notas para enlazar' })).toBeVisible();
  expect(await violationsNow(page), 'lista de enlaces').toEqual([]);
});

test('accesibilidad: la Bandeja (vacía y con un elemento), el cuadro de captura y la Papelera con notas no tienen faltas según axe-core, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goTo(page, 'Bandeja');
  expect(await violationsNow(page), 'bandeja vacía').toEqual([]);
  await page.keyboard.press('Control+Shift+N');
  await expect(page.getByRole('dialog', { name: 'Anotar al vuelo' })).toBeVisible();
  expect(await violationsNow(page), 'captura').toEqual([]);
  await page.getByRole('textbox', { name: 'Anotá lo que se te ocurrió' }).fill('Algo al vuelo');
  await page.keyboard.press('Enter');
  await expect(itemWith(page, 'Algo al vuelo')).toBeVisible();
  expect(await violationsNow(page), 'bandeja con un elemento').toEqual([]);
  await itemWith(page, 'Algo al vuelo').getByRole('button', { name: 'Mover a…' }).click();
  expect(await violationsNow(page), 'mover desde la bandeja').toEqual([]);
  await page.keyboard.press('Escape');
  await itemWith(page, 'Algo al vuelo').getByRole('button', { name: 'Eliminar' }).click();
  await goTo(page, 'Papelera');
  await expect(itemWith(page, 'Algo al vuelo')).toBeVisible();
  expect(await violationsNow(page), 'papelera con un elemento de la bandeja').toEqual([]);
});

test('accesibilidad: la pantalla de la primera vez y Ajustes › «Demostración» con sus botones nuevos no tienen faltas según axe-core, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goTo(page, 'Ajustes');
  expect(await violationsNow(page), 'ajustes').toEqual([]);
  await page.getByRole('button', { name: 'Empezar como la primera vez' }).click();
  await expect(page.getByText('¿Qué querés aprender ahora?')).toBeVisible();
  expect(await violationsNow(page), 'primera vez').toEqual([]);
  await page.getByRole('button', { name: 'Agregar mi primer material' }).click();
  await expect(page.getByText('Escribí qué querés aprender')).toBeVisible();
  expect(await violationsNow(page), 'primera vez con aviso').toEqual([]);
});
