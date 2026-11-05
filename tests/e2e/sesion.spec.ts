import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import {
  advanceDemoDate,
  createCard,
  goTo,
  goToDestination,
  itemWith,
  openCardByQuestion,
  openSubjects,
  rail,
} from './pasos';

// La sesión de estudio de la Fase 10 (H-16, H-17 y H-18) en «Retenia (prueba)» empaquetado, como
// la usa una persona: por rol y por el texto que se ve, con el mouse y con el teclado.

const DESVIO = '¿Qué mide el desvío estándar?';
const DESVIO_ANSWER = 'Cuánto se alejan, en promedio, los datos de la media.';

const progress = (page: Page) => page.getByRole('status', { name: /^Llevás \d+ de \d+$/ });

async function start(page: Page) {
  await goToDestination(page, 'Estudiar');
  const button = page.getByRole('button', { name: 'Empezar', exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByText('PRÁCTICA AUTÓNOMA')).toBeVisible();
}

// La pregunta que se ve ahora en la sesión: el texto de la región sin el camino de contexto, que
// va en el primer renglón.
async function currentQuestion(page: Page): Promise<string> {
  const text = await page.getByRole('region', { name: 'Pregunta' }).innerText();
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  return (lines.at(-1) ?? '').trim();
}

// Muestra la respuesta y califica con el mouse.
async function answer(page: Page, grade: 'La sabía' | 'Con dudas' | 'No la sabía') {
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: grade, exact: true }).click();
}

test('[CA-066] la primera tarjeta muestra solo la pregunta «¿Qué mide el desvío estándar?» y «Mostrar respuesta»: los botones para calificar no existen hasta mostrarla', async ({
  appWindow,
}) => {
  await start(appWindow);
  await expect(rail(appWindow)).toHaveCount(0);
  await expect(progress(appWindow)).toHaveText('0/10');
  await expect(appWindow.getByRole('button', { name: 'Pausar' })).toBeVisible();
  await expect(appWindow.getByText(DESVIO)).toBeVisible();
  await expect(appWindow.getByText('Estadística básica › Media y dispersión')).toBeVisible();
  await expect(appWindow.getByPlaceholder('Tu respuesta…')).toBeVisible();
  for (const name of ['No la sabía', 'Con dudas', 'La sabía']) {
    await expect(appWindow.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(appWindow.getByText(DESVIO_ANSWER)).toHaveCount(0);
  await appWindow.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await expect(appWindow.getByText(DESVIO_ANSWER)).toBeVisible();
  await appWindow.getByRole('button', { name: 'La sabía', exact: true }).click();
  await expect(progress(appWindow)).toHaveText('1/10');
  await expect(appWindow.getByText(DESVIO)).toHaveCount(0);
});

test('[CA-072] [CA-067] Espacio muestra, 2 califica «Con dudas», Ctrl+Z deshace la cuarta (de 4/10 a 3/10) y Esc pausa', async ({
  appWindow,
}) => {
  await start(appWindow);
  await expect(appWindow.getByText(/^Teclas: Espacio muestra la respuesta/)).toBeVisible();
  await appWindow.keyboard.press('Space');
  await expect(appWindow.getByText(DESVIO_ANSWER)).toBeVisible();
  await appWindow.keyboard.press('2');
  await expect(progress(appWindow)).toHaveText('1/10');
  await expect(appWindow.getByText('Calificaste la anterior: Con dudas')).toBeVisible();
  for (const done of ['2/10', '3/10']) {
    await appWindow.keyboard.press('Space');
    await appWindow.keyboard.press('3');
    await expect(progress(appWindow)).toHaveText(done);
  }
  const fourth = await currentQuestion(appWindow);
  await appWindow.keyboard.press('Space');
  await appWindow.keyboard.press('1');
  await expect(progress(appWindow)).toHaveText('4/10');
  await appWindow.keyboard.press('Control+z');
  await expect(progress(appWindow)).toHaveText('3/10');
  expect(await currentQuestion(appWindow)).toBe(fourth);
  await expect(appWindow.getByRole('button', { name: 'Mostrar respuesta' })).toBeVisible();
  await expect(appWindow.getByRole('button', { name: 'No la sabía', exact: true })).toHaveCount(0);
  await answer(appWindow, 'La sabía');
  await expect(progress(appWindow)).toHaveText('4/10');
  await appWindow.getByRole('button', { name: 'Deshacer' }).click();
  await expect(progress(appWindow)).toHaveText('3/10');
  await appWindow.keyboard.press('Escape');
  await expect(
    appWindow.getByRole('button', { name: 'Continuar: sesión de hoy (3 de 10)' }),
  ).toBeVisible();
  await expect(appWindow.getByRole('button', { name: 'Empezar', exact: true })).toBeVisible();
});

test('[CA-068] [CA-073] con 4 de 10, lo escrito en «Tu respuesta…» y Retenia cerrado, al abrirlo Estudiar ofrece «Continuar: sesión de hoy (4 de 10)» y retoma en la quinta con «cuánto se alejan» todavía escrito', async ({
  launchFromStart,
}) => {
  const first = await launchFromStart();
  await start(first.page);
  for (let done = 1; done <= 4; done += 1) {
    await answer(first.page, 'La sabía');
    await expect(progress(first.page)).toHaveText(`${done}/10`);
  }
  const fifth = await currentQuestion(first.page);
  await first.page.getByPlaceholder('Tu respuesta…').fill('cuánto se alejan');
  await expect(first.page.getByText('Borrador guardado')).toBeVisible();
  await first.close();

  const second = await launchFromStart();
  const resume = second.page.getByRole('button', { name: 'Continuar: sesión de hoy (4 de 10)' });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(progress(second.page)).toHaveText('4/10');
  expect(await currentQuestion(second.page)).toBe(fifth);
  await expect(second.page.getByPlaceholder('Tu respuesta…')).toHaveValue('cuánto se alejan');
  await expect(second.page.getByText('Borrador guardado')).toBeVisible();
  await second.close();
});

test('[CA-069] un doble clic rápido en «La sabía» cuenta un solo repaso y avanza una sola tarjeta', async ({
  appWindow,
}) => {
  await start(appWindow);
  await appWindow.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await appWindow.getByRole('button', { name: 'La sabía', exact: true }).dblclick();
  await expect(progress(appWindow)).toHaveText('1/10');
  // Un rato después sigue en 1: el segundo clic no contó.
  await appWindow.getByRole('button', { name: 'Mostrar respuesta' }).waitFor();
  await expect(progress(appWindow)).toHaveText('1/10');
  await appWindow.keyboard.press('Escape');
  await expect(
    appWindow.getByRole('button', { name: 'Continuar: sesión de hoy (1 de 10)' }),
  ).toBeVisible();
});

test('[CA-070] la tarjeta marcada «No la sabía» vuelve antes de terminar, después de al menos otras 3', async ({
  appWindow,
}) => {
  await start(appWindow);
  await answer(appWindow, 'No la sabía');
  const seen: string[] = [];
  for (let step = 0; step < 4; step += 1) {
    seen.push(await currentQuestion(appWindow));
    await answer(appWindow, 'La sabía');
  }
  expect(seen.slice(0, 3)).not.toContain(DESVIO);
  expect(seen[3]).toBe(DESVIO);
  await expect(progress(appWindow)).toHaveText('4/10');
});

test('[CA-077] «Más» → «La tarjeta está mal» sigue con la próxima y, en Apuntes › «Tarjetas», la tarjeta figura «En revisión»', async ({
  appWindow,
}) => {
  await start(appWindow);
  await appWindow.getByRole('button', { name: 'Más' }).click();
  await appWindow.getByRole('menuitem', { name: 'La tarjeta está mal' }).click();
  await expect(
    appWindow.getByText('La tarjeta pasó a «En revisión». No cuenta como olvido.'),
  ).toBeVisible();
  await expect(progress(appWindow)).toHaveText('1/10');
  await expect(appWindow.getByText(DESVIO)).toHaveCount(0);
  await appWindow.getByRole('button', { name: 'Pausar' }).click();
  await goTo(appWindow, 'Tarjetas');
  await openCardByQuestion(appWindow, DESVIO);
  await expect(appWindow.getByText('Estado: En revisión')).toBeVisible();
  await goToDestination(appWindow, 'Progreso');
  await expect(
    appWindow.getByRole('region', { name: 'Tarjetas en revisión' }).getByText(DESVIO),
  ).toBeVisible();
});

test('[CA-074] [CA-075] [CA-076] el cierre: «Sesión terminada» con los minutos, el conteo, no más de 2 dificultades, un próximo paso y la frase; «¿Cómo estuvo?»; y la duda aparece en Progreso › «Dudas y revisiones»', async ({
  appWindow,
}) => {
  await start(appWindow);
  await answer(appWindow, 'No la sabía');
  for (let step = 0; step < 10; step += 1) {
    await answer(appWindow, step === 1 ? 'Con dudas' : 'La sabía');
  }
  await expect(
    appWindow.getByRole('heading', { name: /^Sesión terminada · \d+ min$/ }),
  ).toBeVisible();
  await expect(appWindow.getByText('La sabía: 8')).toBeVisible();
  await expect(appWindow.getByText('Con dudas: 1')).toBeVisible();
  await expect(appWindow.getByText('No la sabía: 1')).toBeVisible();
  await expect(appWindow.getByText(`Media y dispersión: ${DESVIO}`)).toBeVisible();
  await expect(
    appWindow.getByText('Quedan 50 repasos para hoy: podés hacer otra sesión cuando quieras.'),
  ).toBeVisible();
  await expect(
    appWindow.getByText('Completar la sesión no equivale a dominar el tema'),
  ).toBeVisible();
  await expect(appWindow.getByRole('radio', { name: 'Fácil' })).not.toBeChecked();
  await appWindow.getByRole('radio', { name: 'Justo' }).check();
  await expect(appWindow.getByRole('radio', { name: 'Justo' })).toBeChecked();
  await expect(appWindow.getByRole('button', { name: 'Terminar' })).toBeVisible();

  await appWindow.getByRole('button', { name: 'Guardar una duda' }).click();
  const dialog = appWindow.getByRole('dialog', { name: 'Guardar una duda' });
  await dialog.getByLabel('Tu duda').fill('No entiendo por qué se divide por n−1');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(
    appWindow.getByText('Guardé tu duda. La ves en Progreso › «Dudas y revisiones».'),
  ).toBeVisible();
  await appWindow.getByRole('button', { name: 'Terminar' }).click();
  await goToDestination(appWindow, 'Progreso');
  await appWindow.getByRole('button', { name: 'Dudas y revisiones' }).click();
  const doubts = appWindow.getByRole('region', { name: 'Dudas guardadas' });
  await expect(doubts.getByText('No entiendo por qué se divide por n−1')).toBeVisible();
  await expect(doubts.getByText(`De la tarjeta: ${DESVIO}`)).toBeVisible();
  await expect(doubts.getByText('Guardada el 15/03/2027')).toBeVisible();
  await doubts.getByRole('button', { name: 'Abrir la tarjeta' }).click();
  await expect(appWindow.getByRole('heading', { level: 3, name: 'Tarjeta' })).toBeVisible();
  await expect(appWindow.getByText(DESVIO).first()).toBeVisible();
});

test('[CA-071] de dos hermanas que vencen el mismo día entra una sola en la sesión; la otra entra al día siguiente', async ({
  appWindow,
}) => {
  const dialog = await openSubjects(appWindow);
  await dialog.getByRole('button', { name: 'Nueva materia' }).click();
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill('Química orgánica');
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'Química orgánica' })
    .getByRole('button', { name: 'Hacer activa' })
    .click();
  await appWindow.keyboard.press('Escape');
  await goTo(appWindow, 'Tarjetas');
  await createCard(appWindow, '¿Qué es un alcano?', 'Un hidrocarburo saturado');
  await openCardByQuestion(appWindow, '¿Qué es un alcano?');
  await appWindow.getByRole('button', { name: 'Crear inversa' }).click();
  await appWindow.getByRole('button', { name: 'Volver a las tarjetas' }).click();
  for (const question of ['¿Qué es un alcano?', 'Un hidrocarburo saturado']) {
    await itemWith(appWindow, question).first().waitFor();
    await openCardByQuestion(appWindow, question);
    await appWindow.getByRole('button', { name: 'Repasar' }).click();
    await answer(appWindow, 'La sabía');
    await expect(appWindow.getByText('Próximo repaso: miércoles 17/03/2027')).toBeVisible();
    await appWindow.getByRole('button', { name: 'Volver a las tarjetas' }).click();
  }
  await advanceDemoDate(appWindow, '+1 día');
  await advanceDemoDate(appWindow, '+1 día');
  await goToDestination(appWindow, 'Estudiar');
  await start(appWindow);
  await expect(progress(appWindow)).toHaveText('0/1');
  const firstSibling = await currentQuestion(appWindow);
  await answer(appWindow, 'La sabía');
  await expect(appWindow.getByRole('heading', { name: /^Sesión terminada/ })).toBeVisible();
  await appWindow.getByRole('button', { name: 'Terminar' }).click();
  await expect(
    appWindow.getByText('Hoy no tenés repasos vencidos en Química orgánica.'),
  ).toBeVisible();
  await advanceDemoDate(appWindow, '+1 día');
  await goToDestination(appWindow, 'Estudiar');
  await start(appWindow);
  await expect(progress(appWindow)).toHaveText('0/1');
  expect(await currentQuestion(appWindow)).not.toBe(firstSibling);
});
