import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { editor, goTo, openCardByQuestion, openNote, openNotes } from './pasos';

// Tarjetas y fichas (H-12, H-13 y H-14) de punta a punta, como las usa una persona y con los mismos
// pasos y textos de las pruebas manuales de la Fase 08: se escribe en una nota, se ve la tarjeta en
// «Tarjetas», se edita su ficha y se filtra la lista. Retenia (prueba) trae las 180 tarjetas de
// Estadística básica, con el reloj fijo del lunes 15/03/2027.

const SAVED = (page: Page) => page.getByText('Guardado', { exact: true });
const TAG_QA = 'Este renglón es una tarjeta de pregunta y respuesta';
const TAG_CLOZE = 'Este renglón es una tarjeta de completar';

// La nota «Regresión lineal» en el tema «Regresión», abierta y con el foco en el primer renglón.
async function openRegressionNote(page: Page) {
  await openNotes(page);
  await page.getByRole('button', { name: 'Nuevo tema' }).click();
  await page.getByRole('textbox', { name: 'Nombre del tema' }).fill('Regresión');
  await page.getByRole('button', { name: 'Crear' }).click();
  await page.getByRole('button', { name: /^Regresión/ }).click();
  await page.getByRole('button', { name: 'Nueva nota' }).click();
  await expect(page.getByRole('textbox', { name: 'Título' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Título' }).fill('Regresión lineal');
  await editor(page).click();
}

// Vuelve a las notas (guarda lo pendiente) y abre la pestaña «Tarjetas».
async function openCards(page: Page) {
  await expect(SAVED(page)).toBeVisible();
  await page.getByRole('button', { name: 'Volver a las notas' }).click();
  await goTo(page, 'Tarjetas');
}

// Elige un tramo del renglón donde está el cursor: `length` letras a partir de la letra `start`. Se
// hace por el editor y no con Mayús+flechas porque el editor se entera de adónde fue el cursor un
// instante después de que el navegador lo mueve.
async function selectInRow(page: Page, start: number, length: number) {
  await page.evaluate(
    ({ from, size }) => {
      const dom = document.querySelector('.ProseMirror') as unknown as {
        editor: {
          state: { selection: { $from: { start: () => number } } };
          commands: { setTextSelection: (range: { from: number; to: number }) => boolean };
        };
      };
      const origin = dom.editor.state.selection.$from.start();
      dom.editor.commands.setTextSelection({ from: origin + from, to: origin + from + size });
    },
    { from: start, size: length },
  );
}

// Borra un renglón entero con el teclado: vacía su texto y un Retroceso más lo une al de arriba.
async function deleteCardRow(page: Page, text: string) {
  // Tres clics seguidos eligen el renglón entero, como con el mouse.
  await editor(page).locator('p', { hasText: text }).first().click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await expect(editor(page)).not.toContainText(text);
  await page.keyboard.press('Backspace');
}

const openButton = (page: Page, question: string) =>
  page.getByRole('button', { name: `Abrir la tarjeta «${question}»` });

test('[CA-048] «Pendiente >> Cuánto cambia y por cada unidad de x» marca el renglón y aparece en «Tarjetas»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openRegressionNote(page);
  await page.keyboard.type('Pendiente >> Cuánto cambia y por cada unidad de x');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('img', { name: TAG_QA })).toBeVisible();
  await openCards(page);

  await expect(page.getByText('181 tarjetas')).toBeVisible();
  await openButton(page, 'Pendiente').click();
  await expect(page.getByText('Cuánto cambia y por cada unidad de x')).toBeVisible();
});

test('[CA-049] «100 °C» con Ctrl+Mayús+C queda como hueco y la tarjeta pregunta «El agua hierve a [...] al nivel del mar»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openRegressionNote(page);
  await page.keyboard.type('El agua hierve a 100 °C al nivel del mar');
  await selectInRow(page, 'El agua hierve a '.length, '100 °C'.length);
  await page.keyboard.press('Control+Shift+C');
  await expect(page.locator('mark[data-cloze]')).toHaveText('100 °C');
  await expect(page.getByRole('img', { name: TAG_CLOZE })).toBeVisible();
  await openCards(page);

  await expect(openButton(page, 'El agua hierve a [...] al nivel del mar')).toBeVisible();
  await expect(page.getByText('181 tarjetas')).toBeVisible();
});

test('[CA-050] marcar los dos «4» de un renglón crea dos tarjetas con un solo hueco oculto cada una', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openRegressionNote(page);
  const line = 'La media de 2, 4 y 6 es 4 y la mediana es 4.';
  await page.keyboard.type(line);
  // El último «4» (antes del punto) y después el primero de «es 4».
  await selectInRow(page, line.length - 2, 1);
  await page.keyboard.press('Control+Shift+C');
  await selectInRow(page, line.indexOf('es 4 y') + 3, 1);
  await page.keyboard.press('Control+Shift+C');
  await expect(page.locator('mark[data-cloze]')).toHaveCount(2);
  await openCards(page);

  await expect(page.getByText('182 tarjetas')).toBeVisible();
  await expect(openButton(page, 'La media de 2, 4 y 6 es [...] y la mediana es 4.')).toBeVisible();
  await expect(openButton(page, 'La media de 2, 4 y 6 es 4 y la mediana es [...].')).toBeVisible();
});

test('[CA-051] el camino «Estadística básica › Regresión › Regresión lineal» y «Ver en la nota» abre el renglón', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openRegressionNote(page);
  await page.keyboard.type('Pendiente >> Cuánto cambia y por cada unidad de x');
  await openCards(page);
  await openButton(page, 'Pendiente').click();

  await expect(page.getByRole('navigation', { name: 'Camino de la tarjeta' })).toHaveText(
    'Estadística básica › Regresión › Regresión lineal',
  );
  await page.getByRole('button', { name: 'Ver en la nota' }).click();
  await expect(page.getByRole('textbox', { name: 'Título' })).toHaveValue('Regresión lineal');
  await expect(editor(page)).toContainText('Pendiente >> Cuánto cambia y por cada unidad de x');
  await expect(page.getByRole('img', { name: TAG_QA })).toBeVisible();
});

test('[CA-052] al borrar un renglón que es tarjeta con historial pregunta y «Conservar la tarjeta» la deja en «Tarjetas»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openNotes(page);
  await openNote(page, 'Intervalos de confianza');
  await deleteCardRow(page, 'Intervalo de confianza >> Rango de valores plausibles');

  const dialog = page.getByRole('dialog', {
    name: 'Este renglón tiene una tarjeta con historial. ¿Qué hacemos?',
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Conservar la tarjeta' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Eliminar la tarjeta' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Conservar la tarjeta' }).click();

  await page.getByRole('button', { name: 'Volver a las notas' }).click();
  await goTo(page, 'Tarjetas');
  await expect(page.getByText('180 tarjetas')).toBeVisible();
  await openCardByQuestion(page, 'Intervalo de confianza');
  await expect(
    page.getByText('Esta tarjeta ya no está en ningún renglón de una nota.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver en la nota' })).toHaveCount(0);
});

test('[CA-052] «Eliminar la tarjeta» la manda a la Papelera', async ({ launchFromStart }) => {
  const { page } = await launchFromStart();
  await openNotes(page);
  await openNote(page, 'Intervalos de confianza');
  await deleteCardRow(page, 'Intervalo de confianza >> Rango de valores plausibles');
  await page
    .getByRole('dialog', { name: 'Este renglón tiene una tarjeta con historial. ¿Qué hacemos?' })
    .getByRole('button', { name: 'Eliminar la tarjeta' })
    .click();
  await expect(page.getByText('La tarjeta está en la Papelera.')).toBeVisible();

  await page.getByRole('button', { name: 'Volver a las notas' }).click();
  await goTo(page, 'Tarjetas');
  await expect(page.getByText('179 tarjetas')).toBeVisible();
  await goTo(page, 'Papelera');
  await expect(page.getByText('Intervalo de confianza', { exact: true })).toBeVisible();
});

test('[CA-053] la ficha guarda variante y pista, y al volver a abrir siguen ahí con el estado «Revisada»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openRegressionNote(page);
  await page.keyboard.type('Pendiente >> Cuánto cambia y por cada unidad de x');
  await openCards(page);
  await openButton(page, 'Pendiente').click();
  await page.getByRole('button', { name: 'Editar ficha' }).click();
  await page
    .getByRole('textbox', { name: 'Variantes aceptables (una por renglón)' })
    .fill('inclinación de la recta');
  await page.getByRole('textbox', { name: 'Pista 1' }).fill('Empieza con P');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Cambios guardados')).toBeVisible();

  await page.getByRole('button', { name: 'Volver a las tarjetas' }).click();
  await openButton(page, 'Pendiente').click();
  await expect(page.getByText('Variantes aceptables: inclinación de la recta')).toBeVisible();
  await expect(page.getByText('Pista 1: Empieza con P')).toBeVisible();
  await expect(page.getByText('Estado: Revisada')).toBeVisible();
});

test('[CA-054] «No, solo la redacción» conserva el próximo repaso de «¿Qué es la media muestral?»', async ({
  launch,
}) => {
  const { page } = await launch();
  await openCardByQuestion(page, '¿Qué es la media muestral?');
  const before = await page.getByText(/^Próximo repaso: /).textContent();
  await page.getByRole('button', { name: 'Editar ficha' }).click();
  await page.getByRole('textbox', { name: 'Respuesta', exact: true }).press('End');
  await page.keyboard.type('.');
  await page.getByRole('button', { name: 'Guardar' }).click();
  const dialog = page.getByRole('dialog', { name: '¿Cambió lo que hay que recordar?' });
  await expect(dialog.getByRole('button', { name: 'Sí' })).toBeVisible();
  await dialog.getByRole('button', { name: 'No, solo la redacción' }).click();

  await expect(page.getByText('Cambios guardados')).toBeVisible();
  await expect(page.getByText(/^Próximo repaso: /)).toHaveText(before ?? '');
});

test('[CA-054] «Sí» deja la tarjeta como nueva y el historial anterior sigue a la vista', async ({
  launch,
}) => {
  const { page } = await launch();
  await openCardByQuestion(page, '¿Qué es la media muestral?');
  await page.getByRole('button', { name: 'Editar ficha' }).click();
  await page
    .getByRole('textbox', { name: 'Respuesta', exact: true })
    .fill('Otra respuesta, de fondo distinta.');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page
    .getByRole('dialog', { name: '¿Cambió lo que hay que recordar?' })
    .getByRole('button', { name: 'Sí' })
    .click();

  await expect(page.getByText('Todavía sin repasar')).toBeVisible();
  await page.getByRole('button', { name: 'Historial' }).click();
  const rows = page.getByRole('list', { name: 'Repasos de la tarjeta' }).getByRole('listitem');
  await expect(rows).toHaveCount(4);
  await expect(rows.last()).toContainText('Cambió lo que hay que recordar');
  await expect(rows.first()).toContainText('La sabía');
});

test('[CA-055] «Crear inversa» de «Pendiente» crea una tarjeta que pregunta por la respuesta y responde «Pendiente»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openRegressionNote(page);
  await page.keyboard.type('Pendiente >> Cuánto cambia y por cada unidad de x');
  await openCards(page);
  await openButton(page, 'Pendiente').click();
  await page.getByRole('button', { name: 'Crear inversa' }).click();
  await expect(page.getByText('Creé la tarjeta inversa.')).toBeVisible();
  await page.getByRole('button', { name: 'Volver a las tarjetas' }).click();

  await expect(page.getByText('182 tarjetas')).toBeVisible();
  await openButton(page, 'Cuánto cambia y por cada unidad de x').click();
  await expect(page.getByText('Pendiente', { exact: true }).first()).toBeVisible();
});

test('[CA-056] el contador dice 180 y filtrar por «Intervalos de confianza» deja solo esas, cada una con su próximo repaso', async ({
  launch,
}) => {
  const { page } = await launch();
  await expect(page.getByText('180 tarjetas')).toBeVisible();
  await page.getByLabel('Tema').selectOption({ label: 'Intervalos de confianza' });
  await expect(page.getByText('61 de 180 tarjetas')).toBeVisible();
  const rows = page.getByRole('list', { name: 'Tus tarjetas' }).getByRole('listitem');
  expect(await rows.count()).toBeGreaterThan(5);
  for (const row of await rows.all()) {
    await expect(row).toContainText(/Próximo repaso: |Todavía sin repasar/);
    await expect(row).toContainText('Intervalos de confianza');
  }
  await page.getByLabel('Tema').selectOption({ label: 'Todos los temas' });
  await expect(page.getByText('180 tarjetas')).toBeVisible();
});

test('[CA-056] la lista de 180 no arma 180 filas: solo las que se ven', async ({ launch }) => {
  const { page } = await launch();
  await expect(page.getByText('180 tarjetas')).toBeVisible();
  const rows = page.getByRole('list', { name: 'Tus tarjetas' }).getByRole('listitem');
  expect(await rows.count()).toBeLessThan(40);
  await expect(rows.first()).toHaveAttribute('aria-setsize', '180');
});

test('[CA-057] «Pausar esta tarjeta» muestra «En pausa» y «Reanudar» devuelve el próximo repaso', async ({
  launch,
}) => {
  const { page } = await launch();
  await openCardByQuestion(page, '¿Qué mide el desvío estándar?');
  const before = await page.getByText(/^Próximo repaso: /).textContent();
  await page.getByRole('button', { name: 'Pausar esta tarjeta' }).click();
  await expect(page.getByText('En pausa', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Próximo repaso: /)).toHaveCount(0);
  await page.getByRole('button', { name: 'Reanudar' }).click();
  await expect(page.getByText(/^Próximo repaso: /)).toHaveText(before ?? '');
  await expect(page.getByRole('button', { name: 'Pausar esta tarjeta' })).toBeVisible();
});

test('[CA-057] la tarjeta pausada sigue pausada al cerrar y abrir Retenia', async ({ launch }) => {
  const first = await launch();
  await openCardByQuestion(first.page, '¿Qué mide el desvío estándar?');
  await first.page.getByRole('button', { name: 'Pausar esta tarjeta' }).click();
  await expect(first.page.getByText('En pausa', { exact: true })).toBeVisible();
  await first.close();

  const second = await launch();
  await openCardByQuestion(second.page, '¿Qué mide el desvío estándar?');
  await expect(second.page.getByText('En pausa', { exact: true })).toBeVisible();
  await second.close();
});
