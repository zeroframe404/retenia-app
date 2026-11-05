import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { goToDestination } from './pasos';

// Capturas de referencia de la Fase 10: la sesión de estudio (la pregunta con lo escrito, la
// respuesta al lado de lo escrito) y el cierre, en claro y en oscuro. Como las de la Fase 06: una
// referencia nunca se actualiza para que una prueba pase (CLAUDE.md, regla 2 de la red de pruebas).

const ARGS = ['--force-color-profile=srgb', '--disable-lcd-text', '--force-device-scale-factor=1'];
const SCHEMES = [
  ['claro', 'light'],
  ['oscuro', 'dark'],
] as const;

async function shoot(page: Page, name: string) {
  for (const [label, scheme] of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.mouse.move(480, 4);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(page).toHaveScreenshot(`${name}-${label}.png`);
  }
}

test('capturas de referencia: la sesión de estudio y su cierre, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart(undefined, undefined, ARGS);
  await page.setViewportSize({ width: 960, height: 640 });
  await goToDestination(page, 'Estudiar');
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await expect(page.getByText('PRÁCTICA AUTÓNOMA')).toBeVisible();
  await page.getByPlaceholder('Tu respuesta…').fill('cuánto se alejan');
  await expect(page.getByText('Borrador guardado')).toBeVisible();
  await shoot(page, 'sesion-pregunta');
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await expect(page.getByRole('button', { name: 'La sabía', exact: true })).toBeVisible();
  await shoot(page, 'sesion-respuesta');
  await page.getByRole('button', { name: 'No la sabía', exact: true }).click();
  for (let step = 0; step < 10; step += 1) {
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await page.getByRole('button', { name: 'La sabía', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: /^Sesión terminada/ })).toBeVisible();
  await shoot(page, 'sesion-cierre');
});
