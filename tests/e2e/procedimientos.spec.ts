import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { advanceDemoDate, goToDestination } from './pasos';

// La Fase 18 en Retenia (prueba), con el elenco y la fecha fija (lunes 15/03/2027): el ejemplo
// completo, el paso que se vacía, el error señalado por paso, la decisión, el conjunto de 9, otra
// variante al otro día, la tarjeta de contraste y el micro-ejercicio. Los pasos son los de las
// pruebas manuales (docs/pruebas-manuales/fase-18.md).

const PROCEDURE = 'Calcular un intervalo de confianza para la media';
const SET = 'Media, mediana y moda';
const SHOP = 'Una tienda quiere saber qué talle de remera reponer primero';
const UPPER = 'Calculá el límite superior del intervalo.';

// Los enunciados de los 9 problemas del conjunto, del archivo del elenco.
function setQuestions(): string[] {
  const cast = JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, '../../datos-de-ejemplo/elenco/tarjetas.json'),
      'utf8',
    ),
  ) as { conjuntos: { tipos: { problemas: string[] }[] }[] };
  return cast.conjuntos.flatMap((set) => set.tipos.flatMap((type) => type.problemas));
}

// Ctrl+K, escribir y «Practicar ahora» sobre el primer resultado.
async function practiceByName(page: Page, name: string) {
  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog', { name: 'Buscar' });
  await dialog.getByRole('combobox', { name: /Buscar/ }).fill(name);
  await expect(dialog.getByRole('option').first()).toContainText(name.slice(0, 20));
  await dialog.getByRole('button', { name: 'Practicar ahora' }).click();
}

const STATEMENT = /^(En una muestra de|Una fábrica pesó|Se midió cuánto tardan)/;

const statementOf = (page: Page) => page.getByText(STATEMENT).first().innerText();

// Las respuestas de los 4 pasos, calculadas desde el enunciado que se ve: datos, media y desvío
// aparecen en ese orden en los tres enunciados.
function answersFor(statement: string): string[] {
  const [n = 0, mean = 0, deviation = 0] = (statement.match(/\d+(?:,\d+)?/g) ?? []).map((v) =>
    Number(v.replace(',', '.')),
  );
  const error = deviation / Math.sqrt(n);
  return [error, 1.96, 1.96 * error, mean + 1.96 * error].map((v) =>
    String(Number(v.toFixed(4))).replace('.', ','),
  );
}

async function explainExample(page: Page) {
  await page.getByRole('textbox', { name: '¿Por qué este paso?' }).fill('Porque achica el desvío.');
  await page.getByRole('button', { name: 'Terminar el ejemplo' }).click();
}

// Completa los pasos vacíos; el paso `wrong` va mal a propósito.
async function fillBlanks(page: Page, wrong?: number) {
  const answers = answersFor(await statementOf(page));
  for (const [index, answer] of answers.entries()) {
    const field = page.getByRole('textbox', { name: `Paso ${index + 1}: tu resultado` });
    if ((await field.count()) > 0) {
      await field.fill(index + 1 === wrong ? '999' : answer);
    }
  }
}

// «Enviar», «Ver la corrección» si hace falta, «Ver el resultado».
async function sendAndSee(page: Page) {
  await page.getByRole('button', { name: 'Enviar' }).click();
  const correction = page.getByRole('button', { name: 'Ver la corrección' });
  const result = page.getByRole('button', { name: 'Ver el resultado' });
  await expect(correction.or(result)).toBeVisible();
  if (await correction.isVisible()) {
    await correction.click();
  }
  await result.click();
}

async function finishPractice(page: Page) {
  await page.getByRole('button', { name: 'Terminar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Práctica terminada' })).toBeVisible();
}

// Los dos primeros días: el ejemplo completo. Al volver, el tercero, el último paso viene vacío.
async function twoDaysOfExample(page: Page): Promise<string[]> {
  const statements: string[] = [];
  for (let day = 0; day < 2; day += 1) {
    await practiceByName(page, PROCEDURE);
    await expect(page.getByRole('textbox', { name: '¿Por qué este paso?' })).toBeVisible();
    statements.push(await statementOf(page));
    await explainExample(page);
    await finishPractice(page);
    await advanceDemoDate(page, '+1 día');
  }
  return statements;
}

test('[CA-157] la primera vez: los 4 pasos resueltos y «¿Por qué este paso?» en el paso clave', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await practiceByName(page, PROCEDURE);
  await expect(page.getByRole('heading', { name: 'Ejemplo resuelto' })).toBeVisible();
  const steps = page.getByRole('list', { name: 'Los pasos' }).getByRole('listitem');
  await expect(steps).toHaveCount(4);
  await expect(steps.getByText(/^Resultado: /)).toHaveCount(4);
  await expect(page.getByRole('textbox', { name: '¿Por qué este paso?' })).toHaveCount(1);
  await expect(steps.first().getByRole('textbox', { name: '¿Por qué este paso?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Terminar el ejemplo' })).toBeDisabled();
});

test('[CA-158] [CA-159] [CA-160] [CA-164] al tercer día el último paso viene vacío con otros números; un error se señala por paso y el escalón se recuerda al cerrar', async ({
  launchFromStart,
}) => {
  const first = await launchFromStart();
  const seen = await twoDaysOfExample(first.page);
  const { page } = first;
  await practiceByName(page, PROCEDURE);
  await expect(
    page.getByText('Completá el último paso; los demás ya están resueltos.'),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: /: tu resultado$/ })).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Paso 4: tu resultado' })).toBeVisible();
  const third = await statementOf(page);
  expect(new Set([...seen, third]).size).toBe(3);

  // M18.3: un resultado equivocado a propósito.
  await fillBlanks(page, 4);
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Hay un error en el paso 4; ¿lo encontrás?')).toBeVisible();
  await expect(page.getByText(/^El resultado: /)).toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'Paso 4: probá de nuevo' })
    .fill(answersFor(third)[3] ?? '');
  await page.getByRole('button', { name: 'Reintentar el paso 4' }).click();
  await expect(page.getByText('Ahora sí: el paso 4 quedó bien.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver la corrección' }).click();
  await expect(page.getByText('Corregido al reintentar')).toBeVisible();
  await page.getByRole('button', { name: 'Ver el resultado' }).click();
  await expect(page.locator('[data-component="result"]')).toContainText('Vas bien.');

  // M18.9: cerrar y abrir; arranca en el mismo escalón.
  await first.close();
  const again = await launchFromStart();
  await practiceByName(again.page, PROCEDURE);
  await expect(
    again.page.getByText('Completá el último paso; los demás ya están resueltos.'),
  ).toBeVisible();
});

test('[CA-166] el mismo paso mal en dos problemas: el cierre propone el micro-ejercicio y se resuelve entero', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await twoDaysOfExample(page);
  await practiceByName(page, PROCEDURE);
  await fillBlanks(page, 4);
  await sendAndSee(page);
  const before = await statementOf(page);
  await page.getByRole('button', { name: 'Otro problema' }).click();
  await expect(page.getByRole('textbox', { name: 'Paso 4: tu resultado' })).toHaveValue('');
  expect(await statementOf(page)).not.toBe(before);
  await fillBlanks(page, 4);
  await sendAndSee(page);
  await finishPractice(page);
  await expect(
    page.getByText(
      `Se repitió el mismo error en el paso «${UPPER.slice(0, -1)}». Te propongo 7 ítems cortos sobre ese paso.`,
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Hacer el micro-ejercicio' }).click();
  for (let item = 1; item <= 7; item += 1) {
    await expect(page.getByText(`Ítem ${item} de 7`)).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Tu resultado' })
      .fill(answersFor(await statementOf(page))[3] ?? '');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('Correcto.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: item === 7 ? 'Ver el resultado' : 'Siguiente' }).click();
  }
  await expect(page.getByText('Acertaste 7 de 7.')).toBeVisible();
  await expect(
    page.getByText('Llevás 1 de 2 sesiones buenas. Se supera con 2, en días distintos.'),
  ).toBeVisible();
});

test('[CA-161] una decisión: «¿Qué método usarías? No lo resuelvas», los métodos y su porqué', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await practiceByName(page, SHOP);
  const choices = page.getByRole('group', { name: '¿Qué método usarías? No lo resuelvas' });
  await expect(choices.getByRole('radio')).toHaveCount(3);
  await expect(page.getByText('Es el valor que más se repite')).toHaveCount(0);
  await choices.getByRole('radio', { name: 'La media', exact: true }).check();
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByRole('heading', { name: 'El porqué de cada método' })).toBeVisible();
  await expect(page.getByText(/Un talle promedio puede no existir/).first()).toBeVisible();
  await expect(page.getByText(/Es el valor que más se repite/)).toBeVisible();
});

test('[CA-162] el conjunto de 9: ningún enunciado dice el tipo y en el cierre no hay dos iguales seguidos', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await practiceByName(page, SET);
  const questions = setQuestions();
  expect(questions).toHaveLength(9);
  const shown = new Set<string>();
  for (let item = 1; item <= 9; item += 1) {
    await expect(page.getByText(`${SET} · Problema ${item} de 9`)).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Ejercicio' })).toBeVisible();
    // El enunciado a la vista es uno de los 9, y ninguno dice de qué tipo es.
    await expect(
      page.getByRole('textbox', { name: 'Tu respuesta, con coma o con punto' }),
    ).toBeVisible();
    for (const question of questions) {
      if (await page.getByText(question, { exact: true }).isVisible()) {
        shown.add(question);
        expect(question).not.toMatch(/\b(media|mediana|moda)\b/i);
      }
    }
    expect(shown.size).toBe(item);
    await page.getByRole('textbox', { name: 'Tu respuesta, con coma o con punto' }).fill('1');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
  }
  await expect(page.getByRole('heading', { level: 3, name: 'Conjunto terminado' })).toBeVisible();
  const order = await page
    .getByRole('list', { name: 'Los tipos, en el orden en que salieron' })
    .getByRole('listitem')
    .allInnerTexts();
  expect(order).toHaveLength(9);
  const types = order.map((line) => line.split(' · ')[0] ?? '');
  types.slice(1).forEach((type, index) => {
    expect(type).not.toBe(types[index]);
  });
});

test('[CA-163] «Mis errores» › «Crear tarjeta de contraste» arma «¿En qué se diferencian la media y la mediana?»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goToDestination(page, 'Progreso');
  await page
    .getByRole('navigation', { name: 'Secciones de Progreso' })
    .getByRole('button', { name: 'Mis errores' })
    .click();
  await page.getByRole('button', { name: 'Crear tarjeta de contraste' }).click();
  await expect(
    page.getByText('Tarjeta creada: ¿En qué se diferencian la media y la mediana?'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Abrir la tarjeta' }).click();
  await expect(
    page.getByText('¿En qué se diferencian la media y la mediana?').first(),
  ).toBeVisible();
});
