import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { editor, goTo, openNote, openNotes, openSubjects } from './pasos';

// Capturas de referencia de las pantallas de la Fase 07, en claro y en oscuro (mismas reglas que
// `capturas-de-referencia.spec.ts`: ventana de 960 × 640, sin suavizado por color de subpíxel,
// sRGB, escala 1 y sin movimiento). Una referencia NUNCA se actualiza para que una prueba pase:
// solo con `--update-snapshots`, después de que la persona vea y apruebe la diferencia.

const ARGS = ['--force-color-profile=srgb', '--disable-lcd-text', '--force-device-scale-factor=1'];
const SCHEMES = [
  ['claro', 'light'],
  ['oscuro', 'dark'],
] as const;

async function prepare(page: Page) {
  await page.setViewportSize({ width: 960, height: 640 });
  await page.mouse.move(480, 4);
}

async function shoot(page: Page, name: string) {
  for (const [label, scheme] of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.mouse.move(480, 4);
    // Ningún contorno de foco ni cursor en las capturas: lo miden la punta a punta y axe.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page).toHaveScreenshot(`${name}-${label}.png`);
  }
}

test('capturas de referencia: Estudiar con el cuadro «Cambiar», en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart(undefined, undefined, ARGS);
  await prepare(page);
  const dialog = await openSubjects(page);
  await dialog.evaluate((element) => element.blur());
  await shoot(page, 'fase-07-estudiar-materias');
});

test('capturas de referencia: Apuntes › Notas (todas y un tema), en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart(undefined, undefined, ARGS);
  await prepare(page);
  await openNotes(page);
  await shoot(page, 'fase-07-apuntes-notas');
  await openNotes(page, 'Media y dispersión');
  await shoot(page, 'fase-07-apuntes-tema');
});

test('capturas de referencia: la nota «Intervalos de confianza» abierta, con su fórmula, su imagen y su enlace, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart(undefined, undefined, ARGS);
  await prepare(page);
  await openNotes(page);
  await openNote(page, 'Intervalos de confianza');
  await expect(editor(page).locator('.katex')).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Curva normal, la campana de Gauss' }),
  ).toHaveJSProperty('complete', true);
  await shoot(page, 'fase-07-nota-abierta');
});

test('capturas de referencia: la Bandeja con un elemento y el cuadro de captura, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart(undefined, undefined, ARGS);
  await prepare(page);
  await page.keyboard.press('Control+Shift+N');
  await page
    .getByRole('textbox', { name: 'Anotá lo que se te ocurrió' })
    .fill('Revisar teorema central del límite');
  await page.getByRole('dialog', { name: 'Anotar al vuelo' }).evaluate((element) => element.blur());
  await shoot(page, 'fase-07-captura');
  await page.getByRole('textbox', { name: 'Anotá lo que se te ocurrió' }).focus();
  await page.keyboard.press('Enter');
  await goTo(page, 'Bandeja');
  await expect(page.getByText('Revisar teorema central del límite')).toBeVisible();
  await shoot(page, 'fase-07-bandeja');
});

test('capturas de referencia: la pantalla de la primera vez, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart(undefined, undefined, ARGS);
  await prepare(page);
  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: 'Empezar como la primera vez' }).click();
  await expect(page.getByText('¿Qué querés aprender ahora?')).toBeVisible();
  await shoot(page, 'fase-07-primera-vez');
});
