import type { Page } from '@playwright/test';
import { expect } from './apoyo';

// Pasos de usuario que repiten las pruebas de punta a punta de la Fase 04: por rol y por el
// texto que se ve, igual que en las pruebas manuales.

export const itemWith = (page: Page, text: string) =>
  page.getByRole('listitem').filter({ hasText: text });

export async function goTo(
  page: Page,
  section: 'Tarjetas' | 'Papelera' | 'Actividad reciente' | 'Ajustes',
) {
  await page
    .getByRole('navigation', { name: 'Secciones' })
    .getByRole('button', { name: section })
    .click();
  const heading = section === 'Tarjetas' ? 'Tarjetas' : section;
  await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible();
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
