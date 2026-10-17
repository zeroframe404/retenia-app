import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';

// Punta a punta como usuario: selectores por rol y texto visible, sobre Retenia (prueba)
// empaquetada, con el reloj fijo del lunes 15/03/2027 y una carpeta de datos nueva por prueba.
// Cada carpeta nueva arranca con las tres tarjetas de ejemplo.

const SAMPLE_QUESTIONS = [
  '¿Qué mide el desvío estándar?',
  '¿Qué es la varianza?',
  '¿Qué es la media muestral?',
];

async function createCard(page: Page, question: string, answer: string) {
  await page.getByRole('button', { name: 'Nueva tarjeta' }).click();
  await page.getByRole('textbox', { name: 'Pregunta' }).fill(question);
  await page.getByRole('textbox', { name: 'Respuesta' }).fill(answer);
  await page.getByRole('button', { name: 'Guardar' }).click();
}

const itemWith = (page: Page, text: string) => page.getByRole('listitem').filter({ hasText: text });

test('una carpeta de datos nueva arranca con las tres tarjetas de ejemplo, con «¿Qué mide el desvío estándar?» primera', async ({
  appWindow,
}) => {
  await expect(appWindow.getByRole('heading', { level: 3, name: 'Tarjetas' })).toBeVisible();
  const items = appWindow.getByRole('listitem');
  await expect(items).toHaveCount(3);
  await expect(items.first()).toContainText('¿Qué mide el desvío estándar?');
  for (const question of SAMPLE_QUESTIONS) {
    await expect(itemWith(appWindow, question)).toContainText('Todavía sin repasar');
  }
});

test('[CA-009] crea «¿Capital de Francia?», cierra Retenia, la abre de nuevo y la tarjeta sigue en la lista, primera', async ({
  launch,
}) => {
  const first = await launch();
  await createCard(first.page, '¿Capital de Francia?', 'París');
  await expect(first.page.getByText('Tarjeta guardada')).toBeVisible();
  await expect(first.page.getByRole('listitem').first()).toContainText('¿Capital de Francia?');
  await expect(first.page.getByRole('listitem')).toHaveCount(4);
  await first.close();

  const second = await launch();
  const items = second.page.getByRole('listitem');
  await expect(items).toHaveCount(4);
  await expect(items.first()).toContainText('¿Capital de Francia?');
  await expect(items.first()).toContainText('Todavía sin repasar');
  await second.close();
});

test('[CA-011] sin pregunta marca el campo con «Escribí la pregunta», conserva «Roma» y no crea ninguna tarjeta', async ({
  appWindow,
}) => {
  const items = appWindow.getByRole('listitem');
  await expect(items).toHaveCount(3);

  await appWindow.getByRole('button', { name: 'Nueva tarjeta' }).click();
  await appWindow.getByRole('textbox', { name: 'Respuesta' }).fill('Roma');
  await appWindow.getByRole('button', { name: 'Guardar' }).click();

  await expect(appWindow.getByText('Escribí la pregunta')).toBeVisible();
  await expect(appWindow.getByRole('textbox', { name: 'Pregunta' })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(appWindow.getByRole('textbox', { name: 'Pregunta' })).toBeFocused();
  await expect(appWindow.getByRole('textbox', { name: 'Respuesta' })).toHaveValue('Roma');
  await expect(appWindow.getByText('Tarjeta guardada')).toHaveCount(0);
  await expect(items).toHaveCount(3);
  await expect(appWindow.getByRole('button', { name: 'Guardar' })).toBeEnabled();
});

test('[CA-010] «Repasar», «Mostrar respuesta» y «La sabía» muestran «Próximo repaso: miércoles 17/03/2027», y queda al cerrar y abrir', async ({
  launch,
}) => {
  const first = await launch();
  await createCard(first.page, '¿Capital de Francia?', 'París');
  await itemWith(first.page, '¿Capital de Francia?')
    .getByRole('button', { name: 'Repasar' })
    .click();

  await expect(first.page.getByText('¿Capital de Francia?')).toBeVisible();
  await expect(first.page.getByText('París')).toHaveCount(0);
  await expect(first.page.getByRole('button', { name: 'La sabía', exact: true })).toHaveCount(0);
  await first.page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await expect(first.page.getByText('París')).toBeVisible();
  await first.page.getByRole('button', { name: 'La sabía', exact: true }).click();
  await expect(first.page.getByText('Próximo repaso: miércoles 17/03/2027')).toBeVisible();
  await first.page.getByRole('button', { name: 'Volver a las tarjetas' }).click();
  await expect(itemWith(first.page, '¿Capital de Francia?')).toContainText(
    'Próximo repaso: miércoles 17/03/2027',
  );
  await first.close();

  const second = await launch();
  await expect(itemWith(second.page, '¿Capital de Francia?')).toContainText(
    'Próximo repaso: miércoles 17/03/2027',
  );
  await second.close();
});

test('«Con dudas» y «No la sabía» dejan el próximo repaso el martes 16/03/2027', async ({
  appWindow,
}) => {
  for (const [question, grade] of [
    ['Con dudas', 'Con dudas'],
    ['No la sabía', 'No la sabía'],
  ] as const) {
    await createCard(appWindow, `Tarjeta «${question}»`, 'x');
    await itemWith(appWindow, `Tarjeta «${question}»`)
      .getByRole('button', { name: 'Repasar' })
      .click();
    await appWindow.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await appWindow.getByRole('button', { name: grade, exact: true }).click();
    await expect(appWindow.getByText('Próximo repaso: martes 16/03/2027')).toBeVisible();
    await appWindow.getByRole('button', { name: 'Volver a las tarjetas' }).click();
  }
});

test('un doble clic en «Guardar» crea una sola tarjeta y no abre ningún repaso', async ({
  appWindow,
}) => {
  await expect(appWindow.getByRole('listitem')).toHaveCount(3);
  await appWindow.getByRole('button', { name: 'Nueva tarjeta' }).click();
  await appWindow.getByRole('textbox', { name: 'Pregunta' }).fill('¿Capital de Francia?');
  await appWindow.getByRole('textbox', { name: 'Respuesta' }).fill('París');
  await appWindow.getByRole('button', { name: 'Guardar' }).dblclick();

  await expect(appWindow.getByText('Tarjeta guardada')).toBeVisible();
  await expect(appWindow.getByRole('listitem')).toHaveCount(4);
  await expect(itemWith(appWindow, '¿Capital de Francia?')).toHaveCount(1);
  await expect(appWindow.getByRole('heading', { level: 3, name: 'Tarjetas' })).toBeVisible();
});

test('un doble clic en «La sabía» cuenta un solo repaso', async ({ appWindow }) => {
  await itemWith(appWindow, '¿Qué es la varianza?')
    .getByRole('button', { name: 'Repasar' })
    .click();
  await appWindow.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await appWindow.getByRole('button', { name: 'La sabía', exact: true }).dblclick();
  await expect(appWindow.getByText('Próximo repaso: miércoles 17/03/2027')).toBeVisible();
  // Un segundo repaso habría alargado la fecha: el día se queda en el que dio el primero.
  await appWindow.getByRole('button', { name: 'Volver a las tarjetas' }).click();
  await expect(itemWith(appWindow, '¿Qué es la varianza?')).toContainText(
    'Próximo repaso: miércoles 17/03/2027',
  );
});

test('un texto larguísimo con ñ, tildes y emoji se guarda entero y la lista lo corta con puntos suspensivos', async ({
  launch,
}) => {
  const long = `${'Año nuevo, cañón y corazón 🙂 '.repeat(2000)}fin del texto`;
  const first = await launch();
  const page = first.page;
  await page.setViewportSize({ width: 900, height: 700 });
  await createCard(page, long, 'Respuesta con ñ y 🙂');
  await expect(page.getByText('Tarjeta guardada')).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(4);

  const row = page.getByRole('listitem').first();
  const clipped = await row
    .locator('p')
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
        clipped: element.scrollWidth > element.clientWidth,
      };
    });
  expect(clipped).toEqual({ textOverflow: 'ellipsis', whiteSpace: 'nowrap', clipped: true });
  // La lista no se desarma: nada se sale de la ventana.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  await first.close();

  // El texto quedó guardado completo: al repasarla se lee hasta el final.
  const second = await launch();
  await second.page.getByRole('listitem').first().getByRole('button', { name: 'Repasar' }).click();
  await expect(second.page.getByText('fin del texto')).toBeVisible();
  await second.close();
});

test('después de «datos:reiniciar» la lista vuelve a tener solo las tres tarjetas de ejemplo', async ({
  launch,
  dataDir,
}) => {
  const reset = () =>
    execFileSync(
      process.execPath,
      [resolve(import.meta.dirname, '../../tools/datos-reiniciar.mjs')],
      {
        env: { ...process.env, RETENIA_DATOS: dataDir },
        encoding: 'utf8',
      },
    );
  expect(reset()).toContain('quedó como nueva');

  const first = await launch();
  await createCard(first.page, '¿Capital de Francia?', 'París');
  await expect(first.page.getByRole('listitem')).toHaveCount(4);
  await first.close();

  expect(reset()).toContain('Al abrir Retenia aparecen las tres tarjetas de ejemplo');
  const second = await launch();
  const items = second.page.getByRole('listitem');
  await expect(items).toHaveCount(3);
  await expect(itemWith(second.page, '¿Capital de Francia?')).toHaveCount(0);
  await expect(items.first()).toContainText('¿Qué mide el desvío estándar?');
  await second.close();
});
