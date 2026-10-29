import type { Page } from '@playwright/test';
import { expect } from './apoyo';

// Pasos de usuario que repiten las pruebas de punta a punta: por rol y por el texto que se ve,
// igual que en las pruebas manuales.

export const itemWith = (page: Page, text: string) =>
  page.getByRole('listitem').filter({ hasText: text });

export const rail = (page: Page) => page.getByRole('navigation', { name: 'Riel lateral' });

type Destination = 'Estudiar' | 'Apuntes' | 'Materiales' | 'Idiomas' | 'Progreso' | 'Ajustes';

// Un destino del riel, por su nombre: abre su pantalla, con su título.
export async function goToDestination(page: Page, destination: Destination) {
  await rail(page).getByRole('button', { name: destination, exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: destination })).toBeVisible();
}

type Section = 'Notas' | 'Bandeja' | 'Tarjetas' | 'Papelera' | 'Actividad reciente';

// «Notas», «Bandeja», «Tarjetas», «Papelera» y «Actividad reciente» viven adentro de Apuntes;
// «Ajustes» es un destino del riel. La «Bandeja» lleva su contador al lado del nombre.
export async function goTo(page: Page, section: Section | 'Ajustes') {
  if (section === 'Ajustes') {
    await goToDestination(page, 'Ajustes');
    return;
  }
  await goToDestination(page, 'Apuntes');
  await page
    .getByRole('navigation', { name: 'Secciones de Apuntes' })
    .getByRole('button', {
      name: section === 'Bandeja' ? /^Bandeja\b/ : section,
      exact: section !== 'Bandeja',
    })
    .click();
  await expect(page.getByRole('heading', { level: 3, name: section })).toBeVisible();
}

export async function review(
  page: Page,
  question: string,
  grade: 'La sabía' | 'Con dudas' | 'No la sabía',
) {
  await itemWith(page, question).getByRole('button', { name: 'Repasar' }).click();
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: grade, exact: true }).click();
  await expect(page.getByText(/^Próximo repaso: /)).toBeVisible();
  await page.getByRole('button', { name: 'Volver a las tarjetas' }).click();
}

// Ajustes › «Demostración» › «+1 día», «+7 días» o «+35 días».
export async function advanceDemoDate(page: Page, button: '+1 día' | '+7 días' | '+35 días') {
  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: button }).click();
}

export const ribbon = (page: Page) => page.getByText(/^DEMOSTRACIÓN · hoy es /);

// Estudiar › «Cambiar»: el cuadro con la lista de materias.
export async function openSubjects(page: Page) {
  await goToDestination(page, 'Estudiar');
  await page.getByRole('button', { name: 'Cambiar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Tus materias' });
  await expect(dialog).toBeVisible();
  return dialog;
}

// Apuntes › «Notas», con un tema (o «Todas las notas», «Sin tema», «Archivadas») elegido.
export async function openNotes(
  page: Page,
  selection: 'Todas las notas' | 'Sin tema' | 'Archivadas' | string = 'Todas las notas',
) {
  await goTo(page, 'Notas');
  await page.getByRole('button', { name: new RegExp(`^${escapeRegExp(selection)}`) }).click();
}

// Una nota de la lista, abierta por su título.
export async function openNote(page: Page, title: string) {
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Título' })).toBeVisible();
}

// El editor de la nota abierta.
export const editor = (page: Page) => page.getByRole('textbox', { name: 'Contenido de la nota' });

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
