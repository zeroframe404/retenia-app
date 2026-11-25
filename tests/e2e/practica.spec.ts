import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { advanceDemoDate, goTo, itemWith } from './pasos';

// La Fase 16 entera en Retenia (prueba), con el elenco y la fecha fija (lunes 15/03/2027): cada
// tipo de actividad, la escalera de pistas con su pregunta antes de la solución, el panel que no
// borra lo escrito, «Discrepo» con sus motivos y el aviso de evaluación corregida. Los pasos son
// los de las pruebas manuales (docs/pruebas-manuales/fase-16.md).

const OPEN =
  'Un intervalo de confianza del 95 % para la media es [4,2; 5,8]. ¿Qué significa ese 95 %?';

// Apuntes › «Tarjetas», Tipo «Ejercicio» y «Practicar ahora» sobre ese ejercicio.
async function practice(page: Page, question: string) {
  await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('exercise');
  await itemWith(page, question).getByRole('button', { name: 'Practicar ahora' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Ejercicio' })).toBeVisible();
}

const resultOf = (page: Page) => page.locator('[data-component="result"]');

async function answerAndSend(page: Page, text: string) {
  await page.getByPlaceholder('Tu respuesta…').fill(text);
  await page.getByRole('button', { name: 'Enviar' }).click();
}

test('[CA-129] el ejercicio abierto: la respuesta modelo en 3 unidades con casillas y, con 2 marcadas, «Vas bien.»', async ({
  launch,
}) => {
  const { page } = await launch();
  await practice(page, OPEN);
  await answerAndSend(page, 'Que hay un 95 % de que la media esté ahí.');
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  await page.getByRole('checkbox', { name: 'La cubrí: idea 1' }).check();
  await page.getByRole('checkbox', { name: 'La cubrí: idea 2' }).check();
  await expect(resultOf(page).getByText('Vas bien.', { exact: true })).toBeVisible();
});

test('[CA-130] el resultado propuesto se puede bajar y no subir', async ({ launch }) => {
  const { page } = await launch();
  await practice(page, OPEN);
  await answerAndSend(page, 'Algo');
  await page.getByRole('checkbox', { name: 'La cubrí: idea 1' }).check();
  await page.getByRole('checkbox', { name: 'La cubrí: idea 2' }).check();
  await expect(resultOf(page).getByText('Vas bien.', { exact: true })).toBeVisible();
  const change = page.getByRole('group', { name: 'Cambiar resultado' });
  await expect(change.getByRole('radio', { name: 'Correcto.' })).toBeDisabled();
  await change.getByRole('radio', { name: 'Todavía no.' }).check();
  await expect(resultOf(page).getByText('Todavía no.', { exact: true })).toBeVisible();
});

test('[CA-131] «Capital de Francia»: «paris» es «Correcto.»; «Paría», «Todavía no.» con la diferencia letra por letra', async ({
  launch,
}) => {
  const { page } = await launch();
  await practice(page, 'Capital de Francia');
  await answerAndSend(page, 'paris');
  await expect(resultOf(page).getByText('Correcto.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await practice(page, 'Capital de Francia');
  await answerAndSend(page, 'Paría');
  await expect(resultOf(page).getByText('Todavía no.', { exact: true })).toBeVisible();
  const diff = page.getByRole('region', { name: 'Diferencia letra por letra' });
  await expect(diff).toBeVisible();
  await expect(diff.locator('[data-letter="changed"]')).toHaveCount(2);
});

test('[CA-132] «La media de 2, 4 y 9»: «5,0» es correcta y «5.3» no', async ({ launch }) => {
  const { page } = await launch();
  await practice(page, 'La media de 2, 4 y 9');
  await page.getByLabel('Tu respuesta, con coma o con punto').fill('5,0');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(resultOf(page).getByText('Correcto.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await practice(page, 'La media de 2, 4 y 9');
  await page.getByLabel('Tu respuesta, con coma o con punto').fill('5.3');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(resultOf(page).getByText('Todavía no.', { exact: true })).toBeVisible();
});

test('[CA-133] la pregunta de opciones: tres opciones y, al fallar, la explicación de por qué esa no era', async ({
  launch,
}) => {
  const { page } = await launch();
  await practice(page, '¿Qué medida de centro cambia menos si aparece un valor extremo?');
  const options = page.getByRole('group', { name: 'Elegí una opción' });
  await expect(options.getByRole('radio')).toHaveCount(3);
  await options.getByText('La media', { exact: true }).click();
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(
    resultOf(page).getByText('La media usa todos los valores: un valor extremo la arrastra.'),
  ).toBeVisible();
});

test('ordenar pasos: se ordenan con «Subir» y «Bajar» y el resultado dice cada paso', async ({
  launch,
}) => {
  const { page } = await launch();
  await practice(page, 'Ordená los pasos para encontrar la mediana de 7, 3 y 5');
  await expect(
    page.getByRole('region', { name: 'Ordená los pasos' }).getByRole('listitem'),
  ).toHaveCount(4);
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(resultOf(page)).toBeVisible();
  await expect(page.locator('[data-step]')).toHaveCount(4);
});

test('[CA-135] [CA-136] [CA-138] la pista espera al intento, la escalera llega en orden, pregunta antes de la solución y lo escrito no se borra', async ({
  launch,
}) => {
  const { page } = await launch();
  await practice(page, OPEN);
  await expect(page.getByRole('button', { name: 'Pista' })).toBeDisabled();
  await page.getByPlaceholder('Tu respuesta…').fill('Habla');
  await expect(page.getByRole('button', { name: 'Pista' })).toBeEnabled();
  const hints = [
    '¿El 95 % habla de este intervalo o de la forma de construirlo?',
    'Un intervalo de confianza sale de un procedimiento que se puede repetir con otras muestras.',
    'Imaginá 100 muestras, cada una con su intervalo: ¿cuántos contendrían la media?',
  ];
  for (const hint of hints) {
    await page.getByRole('button', { name: 'Pista' }).click();
    await expect(page.getByRole('complementary', { name: 'Pistas' }).getByText(hint)).toBeVisible();
  }
  await page.getByRole('button', { name: 'Pista' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByText(
      'La próxima pista muestra la respuesta completa. ¿Querés intentarlo una vez más?',
    ),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Intentarlo una vez más' }).click();
  await page
    .getByPlaceholder('Tu respuesta…')
    .fill('Habla del procedimiento, no de este intervalo.');
  await page.getByRole('button', { name: 'Fuente' }).click();
  const source = page.getByRole('complementary', { name: 'Fuente' });
  await expect(source.getByText(/El 95 % habla del procedimiento/)).toBeVisible();
  await source.getByRole('button', { name: 'Cerrar el panel' }).click();
  await expect(page.getByPlaceholder('Tu respuesta…')).toHaveValue(
    'Habla del procedimiento, no de este intervalo.',
  );
});

test('[CA-137] después de la pista de concepto, marcar las 3 unidades dice «Logrado con pista de concepto» y el rótulo es «PRÁCTICA CON AYUDA»', async ({
  launch,
}) => {
  const { page } = await launch();
  await practice(page, OPEN);
  await expect(page.getByText('PRÁCTICA AUTÓNOMA')).toBeVisible();
  await page.getByPlaceholder('Tu respuesta…').fill('Habla del método');
  await page.getByRole('button', { name: 'Pista' }).click();
  await page.getByRole('button', { name: 'Pista' }).click();
  await expect(page.getByText('PRÁCTICA CON AYUDA')).toBeVisible();
  await page.getByRole('button', { name: 'Enviar' }).click();
  for (const index of [1, 2, 3]) {
    await page.getByRole('checkbox', { name: `La cubrí: idea ${index}` }).check();
  }
  await expect(resultOf(page).getByText('Logrado con pista de concepto')).toBeVisible();
  await expect(resultOf(page).getByText('Correcto.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await itemWith(page, 'Un intervalo de confianza del 95 %')
    .getByRole('button', { name: /^Abrir la tarjeta/ })
    .click();
  await expect(page.getByText('Comprobación sin ayuda pendiente: martes 16/03/2027')).toBeVisible();
});

test('[CA-139] [CA-140] [CA-141] «Discrepo» con «Mi respuesta era correcta»: «Correcto.», el aviso con el antes, el después y el próximo repaso; «Deshacer» vuelve y el historial guarda las dos', async ({
  launch,
}) => {
  const { page } = await launch();
  await advanceDemoDate(page, '+1 día');
  await goTo(page, 'Tarjetas');
  await practice(page, 'Capital de Francia');
  await answerAndSend(page, 'Ciudad de París');
  await expect(resultOf(page).getByText('Todavía no.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Discrepo' }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Mi respuesta era correcta',
    'La pregunta era ambigua',
    'La referencia está incompleta',
    'La referencia es incorrecta',
  ]);
  await menu.getByRole('menuitem', { name: 'Mi respuesta era correcta' }).click();
  await expect(resultOf(page).getByText('Correcto.', { exact: true })).toBeVisible();
  const notice = page.locator('[data-component="corrected-evaluation"]');
  await expect(notice.getByText('Todavía no → Correcto')).toBeVisible();
  await expect(notice.getByText(/^Próximo repaso: miércoles 17\/03\/2027 → /)).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Entendido' })).toBeVisible();
  await notice.getByRole('button', { name: 'Deshacer' }).click();
  await expect(resultOf(page).getByText('Todavía no.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await itemWith(page, 'Capital de Francia')
    .getByRole('button', { name: /^Abrir la tarjeta/ })
    .click();
  await page.getByRole('button', { name: 'Historial' }).click();
  const history = page.getByRole('list', { name: 'Repasos de la tarjeta' });
  await expect(history.getByText(/16\/03\/2027 · Todavía no\./)).toBeVisible();
  await expect(history.locator('del', { hasText: 'Correcto.' })).toBeVisible();
});

test('[CA-142] «La referencia es incorrecta» deja la tarjeta «En revisión» y sin «Practicar ahora»', async ({
  launch,
}) => {
  const { page } = await launch();
  await practice(page, 'Capital de Francia');
  await answerAndSend(page, 'Lyon');
  await page.getByRole('button', { name: 'Discrepo' }).click();
  await page.getByRole('menuitem', { name: 'La referencia es incorrecta' }).click();
  await expect(
    page.locator('[data-component="corrected-evaluation"]').getByText('Todavía no → No cuenta'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  const row = itemWith(page, 'Capital de Francia');
  await expect(row.getByText(/En revisión/)).toBeVisible();
  await expect(row.getByRole('button', { name: 'Practicar ahora' })).toHaveCount(0);
});

test('«Practicar ahora» desde el buscador abre la actividad sola, fuera de la cola del día', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await page.keyboard.press('Control+K');
  await page.getByRole('combobox', { name: /Buscar/ }).fill('Capital de Francia');
  await page.getByRole('dialog').getByRole('button', { name: 'Practicar ahora' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Ejercicio' })).toBeVisible();
  await expect(page.getByText('Capital de Francia', { exact: true })).toBeVisible();
});

test('en la sesión de Estudiar, la tarjeta trae la barra de ayuda: «Pista» se prende al escribir', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pista' })).toBeDisabled();
  await page.getByPlaceholder('Tu respuesta…').fill('Cuánto se alejan');
  await expect(page.getByRole('button', { name: 'Pista' })).toBeEnabled();
});

test('[CA-130] en «Cambiar resultado», lo que no se puede elegir se ve apagado, no igual que lo que sí', async ({
  launch,
}) => {
  const { page } = await launch();
  await practice(page, OPEN);
  await answerAndSend(page, 'Algo');
  await page.getByRole('checkbox', { name: 'La cubrí: idea 1' }).check();
  await page.getByRole('checkbox', { name: 'La cubrí: idea 2' }).check();
  const change = page.getByRole('group', { name: 'Cambiar resultado' });
  const pill = (name: string) =>
    change.locator('label', { has: page.getByRole('radio', { name, exact: true }) });
  const look = (name: string) =>
    pill(name).evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color, cursor: style.cursor };
    });
  const off = await look('Correcto.');
  const on = await look('Todavía no.');
  expect(off.background).not.toBe(on.background);
  expect(off.color).not.toBe(on.color);
  expect(off.cursor).not.toBe('pointer');
});

test('[CA-138] el panel «Fuente» dice la referencia una sola vez', async ({ launch }) => {
  const { page } = await launch();
  await practice(page, OPEN);
  await page.getByPlaceholder('Tu respuesta…').fill('Habla del método');
  await page.getByRole('button', { name: 'Fuente' }).click();
  const source = page.getByRole('complementary', { name: 'Fuente' });
  await expect(source.getByText(/El 95 % habla del procedimiento/)).toBeVisible();
  await expect(
    source.getByText('Inferencia — capítulos 1 a 4 · página 6', { exact: true }),
  ).toHaveCount(1);
});
