import type { Locator, Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { goTo, goToDestination } from './pasos';

// Capturas de referencia (Fase 06): cada pantalla y la «Galería», en claro y en oscuro, guardadas
// en `tests/e2e/capturas-de-referencia` y comparadas en cada corrida (y en el CI). Sirven para que
// un cambio de aspecto no pase sin que alguien lo vea. Una referencia NUNCA se actualiza para que
// una prueba pase: si la comparación falla, se mira la diferencia y la persona decide.
// Solo se actualizan con `npx playwright test capturas-de-referencia --update-snapshots`, después
// de que la persona vea y apruebe la diferencia (CLAUDE.md, regla 2 de la red de pruebas).
//
// Para que la imagen sea la misma en cualquier máquina: ventana de 960 × 640, sin suavizado por
// color de subpíxel, perfil de color sRGB, escala 1 y sin movimiento.

const ARGS = ['--force-color-profile=srgb', '--disable-lcd-text', '--force-device-scale-factor=1'];
const SCHEMES = [
  ['claro', 'light'],
  ['oscuro', 'dark'],
] as const;

async function prepare(page: Page) {
  await page.setViewportSize({ width: 960, height: 640 });
  await page.mouse.move(480, 4);
}

// Lo que cambia solo, de una corrida a otra, se tapa: el tamaño de las copias de seguridad.
const volatile = (page: Page): Locator[] => [page.getByRole('list', { name: 'Tus copias' })];

async function shoot(page: Page, name: string, mask: Locator[] = []) {
  for (const [label, scheme] of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.mouse.move(480, 4);
    await expect(page).toHaveScreenshot(`${name}-${label}.png`, { mask });
  }
}

for (const destination of ['Estudiar', 'Materiales', 'Idiomas', 'Progreso'] as const) {
  test(`capturas de referencia: ${destination}, en claro y en oscuro`, async ({
    launchFromStart,
  }) => {
    const { page } = await launchFromStart(undefined, undefined, ARGS);
    await prepare(page);
    await goToDestination(page, destination);
    await page.mouse.move(480, 4);
    await shoot(page, destination.toLowerCase());
  });
}

test('capturas de referencia: Apuntes con sus tres secciones, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart(undefined, undefined, ARGS);
  await prepare(page);
  await goTo(page, 'Tarjetas');
  await expect(page.getByRole('listitem')).toHaveCount(3);
  await shoot(page, 'apuntes-tarjetas');
  await goTo(page, 'Papelera');
  await expect(page.getByText('La papelera está vacía.')).toBeVisible();
  await shoot(page, 'apuntes-papelera');
  await goTo(page, 'Actividad reciente');
  await expect(page.getByText('Todavía no hiciste cambios.')).toBeVisible();
  await shoot(page, 'apuntes-actividad');
  await goTo(page, 'Tarjetas');
  await page.getByRole('button', { name: 'Nueva tarjeta' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Escribí la pregunta')).toBeVisible();
  await page.getByRole('textbox', { name: 'Pregunta' }).blur();
  await shoot(page, 'apuntes-formulario-con-aviso');
});

test('capturas de referencia: Ajustes y el cuadro «Buscar», en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart(undefined, undefined, ARGS);
  await prepare(page);
  await goTo(page, 'Ajustes');
  await expect(page.getByRole('list', { name: 'Tus copias' })).toBeVisible();
  await shoot(page, 'ajustes', volatile(page));
  await page.keyboard.press('Control+K');
  await expect(page.getByRole('dialog', { name: 'Buscar' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Buscar' }).evaluate((dialog) => dialog.blur());
  await shoot(page, 'buscar', volatile(page));
});

test('capturas de referencia: la «Galería» entera, de arriba abajo, en claro y en oscuro', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart(undefined, undefined, ARGS);
  await prepare(page);
  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: 'Galería' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Galería' })).toBeVisible();
  const main = page.getByRole('main');
  for (const [label, scheme] of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const { height, total } = await main.evaluate((element) => ({
      height: element.clientHeight,
      total: element.scrollHeight,
    }));
    const slices = Math.ceil(total / height);
    expect(slices).toBeGreaterThan(5);
    for (let slice = 0; slice < slices; slice += 1) {
      await main.evaluate((element, top) => element.scrollTo(0, top), slice * height);
      await page.mouse.move(480, 4);
      // El título se enfoca al abrir la galería: la captura no lleva el contorno del foco.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await expect(page).toHaveScreenshot(
        `galeria-${String(slice + 1).padStart(2, '0')}-${label}.png`,
      );
    }
  }
});
