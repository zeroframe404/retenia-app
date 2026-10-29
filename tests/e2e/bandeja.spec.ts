import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { goTo, goToDestination, itemWith, rail } from './pasos';

// La Bandeja y la captura al vuelo (H-11, CA-046 y CA-047) de punta a punta. El elenco empieza con
// la Bandeja vacía: el riel no muestra ningún contador hasta que se anota algo.

async function capture(page: Page, text: string) {
  await page.keyboard.press('Control+Shift+N');
  const dialog = page.getByRole('dialog', { name: 'Anotar al vuelo' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Anotá lo que se te ocurrió' }).fill(text);
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
}

const badge = (page: Page) => rail(page).getByRole('button', { name: /^Bandeja, / });

test('con la Bandeja vacía el riel tiene solo «Buscar» y los seis destinos', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await expect(rail(page).getByRole('button')).toHaveCount(7);
  await expect(badge(page)).toHaveCount(0);
});

test('[CA-046] Ctrl+Mayús+N desde Progreso anota «Revisar teorema central del límite» en la Bandeja sin pedir materia ni tema', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goToDestination(page, 'Progreso');
  await capture(page, 'Revisar teorema central del límite');

  // Sigue en Progreso, con un cartel y un 1 junto a la Bandeja en el riel.
  await expect(page.getByRole('heading', { level: 2, name: 'Progreso' })).toBeVisible();
  await expect(page.getByText('Anotado en la Bandeja.')).toBeVisible();
  await expect(badge(page)).toHaveAccessibleName('Bandeja, 1 elemento');
  await expect(badge(page)).toContainText('1');

  await goTo(page, 'Bandeja');
  await expect(itemWith(page, 'Revisar teorema central del límite')).toBeVisible();
});

test('[CA-046] el cuadro de captura funciona desde cualquier pantalla, no acepta un texto vacío y se cierra con Esc', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  for (const destination of ['Estudiar', 'Ajustes'] as const) {
    await goToDestination(page, destination);
    await page.keyboard.press('Control+Shift+N');
    const dialog = page.getByRole('dialog', { name: 'Anotar al vuelo' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(dialog.getByText('Escribí algo para anotar')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: destination })).toBeVisible();
  }
  await expect(badge(page)).toHaveCount(0);
});

test('[CA-046] anotar con Ctrl+Mayús+N estando en la Bandeja suma el elemento a la lista que se está viendo', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goTo(page, 'Bandeja');
  await expect(page.getByText(/^La Bandeja está vacía/)).toBeVisible();
  await capture(page, 'Anotado mirando la Bandeja');
  await expect(itemWith(page, 'Anotado mirando la Bandeja')).toBeVisible();
  await capture(page, 'Otro más');
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await expect(badge(page)).toHaveAccessibleName('Bandeja, 2 elementos');
});

test('[CA-046] lo anotado sigue en la Bandeja al cerrar y abrir Retenia', async ({
  launchFromStart,
  dataDir,
}) => {
  const first = await launchFromStart();
  await capture(first.page, 'Mirar el capítulo 4');
  await first.close();

  const second = await launchFromStart(dataDir);
  await expect(badge(second.page)).toHaveAccessibleName('Bandeja, 1 elemento');
});

test('[CA-047] «Mover a…» «Intervalos de confianza» convierte el elemento en una nota de ese tema y el contador baja en uno', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await capture(page, 'Revisar teorema central del límite');
  await capture(page, 'Buscar un ejemplo de intervalo');
  await expect(badge(page)).toHaveAccessibleName('Bandeja, 2 elementos');

  await goTo(page, 'Bandeja');
  await itemWith(page, 'Revisar teorema central del límite')
    .getByRole('button', { name: 'Mover a…' })
    .click();
  await page
    .getByRole('dialog', { name: 'Mover a…' })
    .getByRole('button', { name: 'Intervalos de confianza' })
    .click();

  await expect(itemWith(page, 'Revisar teorema central del límite')).toHaveCount(0);
  await expect(badge(page)).toHaveAccessibleName('Bandeja, 1 elemento');

  await goTo(page, 'Notas');
  // El tema, con su cantidad de notas (la nota del elenco se llama igual, pero sin la cantidad).
  await page.getByRole('button', { name: /^Intervalos de confianza · / }).click();
  await expect(itemWith(page, 'Revisar teorema central del límite')).toBeVisible();
});

test('[CA-047] con la Bandeja vacía queda su mensaje y el riel vuelve a no mostrar el contador', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await capture(page, 'Un solo elemento');
  await goTo(page, 'Bandeja');
  await itemWith(page, 'Un solo elemento').getByRole('button', { name: 'Mover a…' }).click();
  await page
    .getByRole('dialog', { name: 'Mover a…' })
    .getByRole('button', { name: 'Media y dispersión' })
    .click();
  await expect(page.getByText(/^La Bandeja está vacía/)).toBeVisible();
  await expect(badge(page)).toHaveCount(0);
});

test('eliminar un elemento de la Bandeja lo manda a la Papelera, desde donde vuelve', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await capture(page, 'Algo que ya no sirve');
  await goTo(page, 'Bandeja');
  await itemWith(page, 'Algo que ya no sirve').getByRole('button', { name: 'Eliminar' }).click();
  await expect(itemWith(page, 'Algo que ya no sirve')).toHaveCount(0);
  await goTo(page, 'Papelera');
  const trashed = itemWith(page, 'Algo que ya no sirve');
  await expect(trashed).toBeVisible();
  await trashed.getByRole('button', { name: 'Restaurar' }).click();
  await goTo(page, 'Bandeja');
  await expect(itemWith(page, 'Algo que ya no sirve')).toBeVisible();
});
