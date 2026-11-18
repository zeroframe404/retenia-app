import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { goTo, goToDestination } from './pasos';

// El buscador (H-23 y H-24) de punta a punta en «Retenia (prueba)» empaquetado, como lo usa una
// persona: Ctrl+K, por el texto que se ve y con el teclado.

const DESVIO = '¿Qué mide el desvío estándar?';
const searchBox = (page: Page) =>
  page.getByRole('dialog', { name: 'Buscar' }).getByRole('combobox', {
    name: 'Buscar en tus apuntes y tarjetas',
  });
const options = (page: Page) => page.getByRole('dialog', { name: 'Buscar' }).getByRole('option');

async function openSearch(page: Page) {
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Buscar' })).toBeVisible();
  await expect(searchBox(page)).toBeFocused();
}

async function typeQuery(page: Page, text: string) {
  await searchBox(page).fill(text);
}

test('[CA-095] humo S4: Ctrl+K, «desvio» sin tilde trae primero «¿Qué mide el desvío estándar?» y Esc deja todo como estaba', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goToDestination(page, 'Progreso');
  await openSearch(page);
  await typeQuery(page, 'desvio');
  await expect(options(page).first()).toContainText(DESVIO);
  await expect(options(page).first().locator('mark')).toHaveText('desvío');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: 'Progreso' })).toBeVisible();
});

test('[CA-096] «varian» encuentra lo que dice «varianza»', async ({ launchFromStart }) => {
  const { page } = await launchFromStart();
  await openSearch(page);
  await typeQuery(page, 'varian');
  await expect(options(page).filter({ hasText: '¿Qué es la varianza?' })).toHaveCount(1);
  for (const text of await options(page).allInnerTexts()) {
    expect(text.toLowerCase()).toContain('varian');
  }
});

test('[CA-097] «sqrt(n» encuentra el renglón «s / sqrt(n)» de «Intervalos de confianza»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openSearch(page);
  await typeQuery(page, 'sqrt(n');
  const row = options(page).filter({ hasText: 's / sqrt(n)' });
  await expect(row.first()).toContainText('Intervalos de confianza');
});

test('[CA-098] «tipo:tarjeta mediana» muestra solo tarjetas y «materia:historia mayo», la de la Revolución de Mayo', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openSearch(page);
  await typeQuery(page, 'tipo:tarjeta mediana');
  await expect(options(page).first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Buscar' }).getByRole('group')).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Tarjetas' })).toBeVisible();
  await typeQuery(page, 'materia:historia mayo');
  await expect(
    options(page).filter({ hasText: '¿En qué año fue la Revolución de Mayo?' }),
  ).toHaveCount(1);
});

test('[CA-099] después de renombrar el tema «Media y dispersión» a «Medidas de resumen», buscar el nombre viejo lo encuentra', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goTo(page, 'Notas');
  await page.getByRole('button', { name: /^Media y dispersión/ }).click();
  await page.getByRole('button', { name: 'Renombrar' }).click();
  const rename = page.getByRole('dialog');
  await rename.getByRole('textbox').fill('Medidas de resumen');
  await rename.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await openSearch(page);
  await typeQuery(page, 'Media y dispersión');
  await expect(options(page).first()).toContainText('Medidas de resumen');
});

test('[CA-100] una nota recién creada, «Teorema de Bayes», aparece al buscar «bayes»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goTo(page, 'Notas');
  await page.getByRole('button', { name: 'Nueva nota' }).click();
  await page.getByRole('textbox', { name: 'Título de la nota' }).fill('Teorema de Bayes');
  await page.getByRole('textbox', { name: 'Contenido de la nota' }).click();
  await page.keyboard.type('Actualiza una probabilidad');

  await openSearch(page);
  await typeQuery(page, 'bayes');
  await expect(options(page).first()).toContainText('Teorema de Bayes');
});

test('[CA-101] «zzzz» dice «No encontré nada con “zzzz”» y sugiere otra palabra', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openSearch(page);
  await typeQuery(page, 'zzzz');
  const dialog = page.getByRole('dialog', { name: 'Buscar' });
  await expect(dialog.getByText('No encontré nada con “zzzz”')).toBeVisible();
  await expect(dialog.getByText('Probá con otra palabra o con menos letras.')).toBeVisible();
});

test('un texto larguísimo y símbolos con comillas no rompen el buscador', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openSearch(page);
  await typeQuery(page, `${'palabra '.repeat(400)}"*()[]`);
  await expect(page.getByRole('dialog', { name: 'Buscar' }).getByRole('alert')).toHaveCount(0);
  await typeQuery(page, '"*()[]');
  await expect(
    page.getByRole('dialog', { name: 'Buscar' }).getByText(/^No encontré nada con/),
  ).toBeVisible();
});

test('las flechas y Enter abren el resultado elegido', async ({ launchFromStart }) => {
  const { page } = await launchFromStart();
  await openSearch(page);
  await typeQuery(page, 'tipo:tarjeta desvio');
  await expect(options(page).first()).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(options(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: DESVIO })).toBeVisible();
});

test('[CA-102] durante una sesión, Ctrl+K abre un resultado en un panel lateral y al cerrarlo la tarjeta y el borrador siguen intactos', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goToDestination(page, 'Estudiar');
  const start = page.getByRole('button', { name: 'Empezar', exact: true });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByText('PRÁCTICA AUTÓNOMA')).toBeVisible();
  const field = page.getByPlaceholder('Tu respuesta…');
  await field.fill('mi borrador a medias');

  await openSearch(page);
  await typeQuery(page, 'intervalos');
  await expect(options(page).first()).toBeVisible();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Intervalos de confianza' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Un intervalo de confianza da un rango/)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('PRÁCTICA AUTÓNOMA')).toBeVisible();
  await expect(field).toHaveValue('mi borrador a medias');
  await expect(field).toBeFocused();
});

test('[CA-103] con 10.000 tarjetas, buscar es inmediato y la materia «Volumen» se recorre sin trabarse', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: 'Cargar 10.000 tarjetas' }).click();
  await expect(page.getByText('Listo: 10.000 tarjetas en la materia «Volumen».')).toBeVisible({
    timeout: 120_000,
  });

  await openSearch(page);
  await typeQuery(page, 'desvio');
  await expect(options(page).first()).toContainText(DESVIO, { timeout: 2_000 });
  await page.keyboard.press('Escape');

  await goToDestination(page, 'Estudiar');
  await page.getByRole('button', { name: 'Cambiar' }).click();
  const subjects = page.getByRole('dialog');
  await subjects
    .getByRole('listitem')
    .filter({ hasText: 'Volumen' })
    .getByRole('button', { name: 'Abrir' })
    .click();
  await goTo(page, 'Tarjetas');
  await expect(page.getByText('10.000 tarjetas')).toBeVisible();
});

test('Ajustes › «Datos y copias»: «Reconstruir índice de búsqueda» y «Verificar datos» dan «Todo en orden · 0 diferencias»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: 'Reconstruir índice de búsqueda' }).click();
  await expect(page.getByText(/^Índice reconstruido: \d+ elementos\.$/)).toBeVisible();
  await page.getByRole('button', { name: 'Verificar datos' }).click();
  await expect(page.getByText('Todo en orden · 0 diferencias')).toBeVisible();
});
