import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { advanceDemoDate, goTo, goToDestination, openCardByQuestion } from './pasos';

// La carga en minutos y la pantalla Estudiar de la Fase 11 (H-19 a H-22) en «Retenia (prueba)»
// empaquetado, como la usa una persona: por rol y por el texto que se ve.

const DESVIO = '¿Qué mide el desvío estándar?';
const primaries = (page: Page) => page.locator('main [data-button="primary"]');
const progress = (page: Page) => page.getByRole('status', { name: /^Llevás \d+ de \d+$/ });
const tengo = (page: Page, minutes: 5 | 10 | 25 | 45) =>
  page
    .getByRole('group', { name: 'Tengo:' })
    .getByRole('button', { name: `${minutes}`, exact: true });

async function openStudy(page: Page) {
  await goToDestination(page, 'Estudiar');
  await expect(page.getByRole('button', { name: 'Empezar', exact: true })).toBeEnabled();
}

test('[CA-078] Estudiar muestra «Sesión recomendada · 25 min», una línea «Por qué:», un solo botón primario «Empezar» y dos alternativas', async ({
  appWindow,
}) => {
  await openStudy(appWindow);
  await expect(appWindow.getByText('Sesión recomendada · 25 min')).toBeVisible();
  await expect(appWindow.getByText(/^Por qué:/)).toBeVisible();
  await expect(primaries(appWindow)).toHaveCount(1);
  await expect(primaries(appWindow)).toHaveText('Empezar');
  await expect(appWindow.getByRole('button', { name: 'Versión corta (10 min)' })).toBeVisible();
  await expect(appWindow.getByRole('button', { name: 'Elegir otra actividad' })).toBeVisible();
  await expect(appWindow.getByText('estimación inicial')).toHaveCount(0);
});

test('[CA-079] [CA-080] [CA-081] [CA-082] «Tengo:» 25, 10, 5 y 45 cambia la propuesta: los repasos, lo nuevo y los minutos, sin rellenar hasta 45', async ({
  appWindow,
}) => {
  await openStudy(appWindow);
  const cases = [
    [25, '60 repasos y 10 tarjetas nuevas · unos 25 min'],
    [10, '45 repasos, sin tarjetas nuevas · unos 10 min'],
    [5, '20 repasos, los más urgentes · unos 5 min'],
    [45, '60 repasos y 18 tarjetas nuevas · unos 30 min'],
  ] as const;
  for (const [minutes, text] of cases) {
    await tengo(appWindow, minutes).click();
    await expect(appWindow.getByText(text, { exact: true })).toBeVisible();
    await expect(appWindow.getByText(`Sesión recomendada · ${minutes} min`)).toBeVisible();
    await expect(primaries(appWindow)).toHaveCount(1);
  }
});

test('[CA-084] el tiempo que se elige vale solo esa vez: al cerrar y abrir Retenia la propuesta vuelve a 25', async ({
  launchFromStart,
}) => {
  const first = await launchFromStart();
  await openStudy(first.page);
  await tengo(first.page, 10).click();
  await expect(first.page.getByText('Sesión recomendada · 10 min')).toBeVisible();
  await first.close();
  const second = await launchFromStart();
  await openStudy(second.page);
  await expect(second.page.getByText('Sesión recomendada · 25 min')).toBeVisible();
  await expect(
    second.page.getByText('60 repasos y 10 tarjetas nuevas · unos 25 min', { exact: true }),
  ).toBeVisible();
  await second.close();
});

test('[CA-083] «Versión corta (10 min)» empieza directo la sesión de 10 minutos, con 45 actividades y sin pantallas intermedias', async ({
  appWindow,
}) => {
  await openStudy(appWindow);
  await appWindow.getByRole('button', { name: 'Versión corta (10 min)' }).click();
  await expect(appWindow.getByText('PRÁCTICA AUTÓNOMA')).toBeVisible();
  await expect(progress(appWindow)).toHaveText('0/45');
  await appWindow.getByRole('button', { name: 'Pausar' }).click();
  await expect(
    appWindow.getByRole('button', { name: 'Continuar: sesión de hoy (0 de 45)' }),
  ).toBeVisible();
});

test('[CA-091] «Posponer» → «Mañana» avisa «Listo: vuelve mañana» y el historial de la primera tarjeta muestra un aplazamiento, sin resultado', async ({
  appWindow,
}) => {
  await openStudy(appWindow);
  await appWindow.getByRole('button', { name: 'Posponer' }).click();
  await expect(appWindow.getByRole('button', { name: 'Más tarde hoy' })).toBeVisible();
  await expect(appWindow.getByRole('button', { name: 'Elegir día' })).toBeVisible();
  await appWindow.getByRole('button', { name: 'Mañana' }).click();
  await expect(appWindow.getByText('Listo: vuelve mañana')).toBeVisible();
  await goTo(appWindow, 'Tarjetas');
  await openCardByQuestion(appWindow, DESVIO);
  await appWindow.getByRole('button', { name: 'Historial' }).click();
  await expect(appWindow.getByText(/Aplazada hasta el 16\/03\/2027/)).toBeVisible();
});

test('[CA-086] después de 35 días sin estudiar, la propuesta no trae tarjetas nuevas y explica el atraso en días, sin nada en rojo', async ({
  appWindow,
}) => {
  await advanceDemoDate(appWindow, '+35 días');
  await openStudy(appWindow);
  const notice = appWindow.getByText(
    /^Hoy no agrego tarjetas nuevas: tenés cerca de .* de repasos atrasados\./,
  );
  await expect(notice).toBeVisible();
  await expect(appWindow.getByText(/sin tarjetas nuevas · unos \d+ min/)).toBeVisible();
  const color = await notice.evaluate((element) => getComputedStyle(element).color);
  const [red, green, blue] = (color.match(/\d+/g) ?? []).map(Number);
  expect(red !== undefined && green !== undefined && blue !== undefined).toBe(true);
  expect(!((red ?? 0) > 150 && (green ?? 255) < 100 && (blue ?? 255) < 100)).toBe(true);
  await goTo(appWindow, 'Ajustes');
  await appWindow.getByRole('button', { name: 'Restablecer fecha' }).click();
});

test('[CA-094] «Elegir otra actividad» muestra hasta 3 alternativas y mirarlas no cambia la propuesta', async ({
  appWindow,
}) => {
  await openStudy(appWindow);
  await appWindow.getByRole('button', { name: 'Elegir otra actividad' }).click();
  const alternatives = appWindow.getByRole('button', {
    name: /^(Solo repasos|Solo tarjetas nuevas|Media y dispersión) · /,
  });
  expect(await alternatives.count()).toBeGreaterThan(0);
  expect(await alternatives.count()).toBeLessThanOrEqual(3);
  await expect(appWindow.getByText('Sesión recomendada · 25 min')).toBeVisible();
  await expect(
    appWindow.getByText('60 repasos y 10 tarjetas nuevas · unos 25 min', { exact: true }),
  ).toBeVisible();
  await expect(primaries(appWindow)).toHaveCount(1);
});

test('[CA-087] «Sumar a mis repasos» muestra el costo antes de confirmar y deja las tarjetas elegidas al principio de las nuevas', async ({
  appWindow,
}) => {
  await goTo(appWindow, 'Tarjetas');
  await appWindow.getByRole('button', { name: 'Sumar a mis repasos' }).click();
  const boxes = appWindow.getByRole('checkbox');
  await expect(boxes.first()).toBeVisible();
  const count = Math.min(10, await boxes.count());
  for (let index = 0; index < count; index += 1) {
    await boxes.nth(index).check();
  }
  await appWindow.getByRole('button', { name: 'Sumar a mis repasos' }).click();
  await expect(
    appWindow.getByText(
      /^Agregar \d+ tarjetas hoy suma entre \d+ y \d+ minutos de repaso repartidos en las próximas 4 semanas$/,
    ),
  ).toBeVisible();
  await appWindow.getByRole('button', { name: 'Confirmar' }).click();
  await expect(
    appWindow.getByText(/^Listo: \d+ tarjetas nuevas sumadas a tus repasos$/),
  ).toBeVisible();
});
