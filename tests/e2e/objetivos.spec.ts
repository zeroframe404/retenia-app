import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { advanceDemoDate, goTo, goToDestination, itemWith } from './pasos';

// La Fase 17 en Retenia (prueba), con el elenco y la fecha fija (lunes 15/03/2027): crear un
// objetivo, el estado que sale de practicar (con «+1 día» y «+7 días»), el panel de evidencias, un
// requisito que frena Estudiar y se descarta, «Mejorar la tarjeta», «Mis errores» y la línea del
// diagnóstico. Los pasos son los de las pruebas manuales (docs/pruebas-manuales/fase-17.md).

const OPEN =
  'Un intervalo de confianza del 95 % para la media es [4,2; 5,8]. ¿Qué significa ese 95 %?';
const INTERPRET = 'Interpretar un intervalo de confianza';
const CALCULATE = 'Calcular la media y el desvío';
const NINETY_FIVE = '¿Qué significa el 95 % en un intervalo de confianza del 95 %?';

const progressSections = (page: Page) =>
  page.getByRole('navigation', { name: 'Secciones de Progreso' });

// M17.1: Progreso › «Nuevo objetivo», con el tema, el texto, el tipo y el ejercicio abierto.
async function createInterpret(page: Page) {
  await goToDestination(page, 'Progreso');
  await page.getByRole('button', { name: 'Nuevo objetivo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo objetivo' });
  await dialog
    .getByLabel('Tema', { exact: true })
    .selectOption({ label: 'Intervalos de confianza' });
  await dialog.getByLabel('Texto', { exact: true }).fill(INTERPRET);
  await dialog.getByRole('radio', { name: 'Comprender' }).check();
  await dialog.getByRole('checkbox', { name: new RegExp(`^${escapeRegExp(OPEN)}`) }).check();
  await dialog.getByRole('button', { name: 'Crear objetivo' }).click();
  await expect(dialog).toBeHidden();
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const objectiveRow = (page: Page, title: string) =>
  page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: title, exact: true }) });

// Practicar el ejercicio abierto (M17.2 a M17.6): con o sin la pista de concepto, y las unidades
// que se marcan.
async function practiceOpen(page: Page, units: number, withConceptHint = false) {
  await goTo(page, 'Tarjetas');
  await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('exercise');
  await itemWith(page, OPEN).getByRole('button', { name: 'Practicar ahora' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Ejercicio' })).toBeVisible();
  await page.getByPlaceholder('Tu respuesta…').fill('El 95 % es del procedimiento.');
  if (withConceptHint) {
    await page.getByRole('button', { name: 'Pista' }).click();
    await page.getByRole('button', { name: 'Pista' }).click();
  }
  await page.getByRole('button', { name: 'Enviar' }).click();
  for (let index = 1; index <= units; index += 1) {
    await page.getByRole('checkbox', { name: `La cubrí: idea ${index}` }).check();
  }
  await page.getByRole('button', { name: 'Siguiente' }).click();
}

async function stateOf(page: Page, title: string) {
  await goToDestination(page, 'Progreso');
  return objectiveRow(page, title).locator('[data-component="mastery-state"]');
}

test('[CA-143] crear «Interpretar un intervalo de confianza» con el ejercicio abierto: aparece en Progreso «Sin iniciar»', async ({
  launch,
}) => {
  const { page } = await launch();
  await createInterpret(page);
  const topic = page.getByRole('region', { name: 'Objetivos de Intervalos de confianza' });
  await expect(objectiveRow(page, INTERPRET)).toContainText('Sin iniciar');
  await expect(objectiveRow(page, INTERPRET)).toContainText('Comprender');
  await expect(topic.getByRole('button').first()).toHaveText('Recordar: Intervalos de confianza');
});

test('[CA-144] [CA-145] [CA-146] [CA-147] [CA-148] [CA-149] con ayuda no acredita, uno solo no alcanza, dos días distintos, la demora consolida, fallar no reinicia y el panel lo muestra', async ({
  launch,
}) => {
  test.setTimeout(180_000);
  const { page } = await launch();
  await createInterpret(page);
  // M17.2: con la pista de concepto y las 3 unidades.
  await practiceOpen(page, 3, true);
  await expect(await stateOf(page, INTERPRET)).toContainText('En práctica');
  // M17.3: +1 día, sin pistas.
  await advanceDemoDate(page, '+1 día');
  await practiceOpen(page, 3);
  await expect(await stateOf(page, INTERPRET)).toContainText('En práctica');
  // M17.4: +1 día.
  await advanceDemoDate(page, '+1 día');
  await practiceOpen(page, 3);
  await expect(await stateOf(page, INTERPRET)).toContainText('Suficiente para avanzar');
  // M17.5: +7 días.
  await advanceDemoDate(page, '+7 días');
  await practiceOpen(page, 3);
  await expect(await stateOf(page, INTERPRET)).toContainText('Consolidado');
  // M17.6: +1 día, 0 unidades.
  await advanceDemoDate(page, '+1 día');
  await practiceOpen(page, 0);
  const state = await stateOf(page, INTERPRET);
  await expect(state).toContainText('A revisar');
  await expect(state).not.toContainText('Sin iniciar');
  // M17.7: el panel.
  await page.getByRole('button', { name: INTERPRET, exact: true }).click();
  const panel = page.getByRole('dialog', { name: INTERPRET });
  const evidence = panel.getByRole('region', { name: 'Evidencias' });
  // Las cuatro columnas, en orden, cada una con su conteo y su última fecha (exactos).
  await expect(evidence.getByRole('term')).toHaveText([
    'Sin ayuda',
    'Con ayuda',
    'Diferido',
    'Variantes',
  ]);
  await expect(evidence.getByRole('definition')).toHaveText([
    '3',
    'Última: 24/03/2027',
    '1',
    'Última: 15/03/2027',
    '1',
    'Última: 24/03/2027',
    '0',
    'Ninguna todavía',
  ]);
  await expect(
    panel.getByText(
      'Qué falta para volver a «Suficiente para avanzar»: un acierto sin ayuda otro día.',
    ),
  ).toBeVisible();
  await expect(
    panel.getByText(
      /^Lo que estima Retenia de «intervalo de confianza»: unos \d+ de cada 10, con 5 observaciones\.$/,
    ),
  ).toBeVisible();
});

test('[CA-150] «Ya lo sé» deja «(por verificar)»; al día siguiente Estudiar propone la comprobación y un acierto sin ayuda la quita', async ({
  launch,
}) => {
  test.setTimeout(120_000);
  const { page } = await launch();
  await createInterpret(page);
  await page.getByRole('button', { name: INTERPRET, exact: true }).click();
  const panel = page.getByRole('dialog', { name: INTERPRET });
  await panel.getByRole('button', { name: 'Ya lo sé' }).click();
  await expect(
    panel.getByText('Suficiente para avanzar (por verificar)', { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText('Comprobación pendiente desde el 16/03/2027.')).toBeVisible();
  // El mismo día todavía no se puede hacer.
  await expect(panel.getByRole('button', { name: 'Hacer la comprobación' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await goToDestination(page, 'Estudiar');
  await expect(page.getByRole('note', { name: 'Comprobación pendiente' })).toHaveCount(0);
  await advanceDemoDate(page, '+1 día');
  await goToDestination(page, 'Estudiar');
  const note = page.getByRole('note', { name: 'Comprobación pendiente' });
  await expect(note).toContainText('Comprobación pendiente: Interpretar un intervalo de confianza');
  await expect(note).toContainText(
    'Por qué: marcaste «Ya lo sé»; un acierto sin ayuda lo confirma.',
  );
  await note.getByRole('button', { name: 'Hacer la comprobación' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'Ejercicio' })).toBeVisible();
  await page.getByPlaceholder('Tu respuesta…').fill('El 95 % es del procedimiento.');
  await page.getByRole('button', { name: 'Enviar' }).click();
  for (let index = 1; index <= 3; index += 1) {
    await page.getByRole('checkbox', { name: `La cubrí: idea ${index}` }).check();
  }
  await page.getByRole('button', { name: 'Siguiente' }).click();
  const state = await stateOf(page, INTERPRET);
  await expect(state).toContainText('Suficiente para avanzar');
  await expect(state).not.toContainText('por verificar');
  await goToDestination(page, 'Estudiar');
  await expect(page.getByRole('note', { name: 'Comprobación pendiente' })).toHaveCount(0);
});

test('[CA-151] [CA-152] un requisito indispensable frena Estudiar («Antes conviene») y «Esto no es necesario para aquello» lo saca al instante', async ({
  launch,
}) => {
  const { page } = await launch();
  await createInterpret(page);
  // M17.8: desde «Calcular la media y el desvío» (ya viene en el elenco).
  await page.getByRole('button', { name: CALCULATE, exact: true }).click();
  const panel = page.getByRole('dialog', { name: CALCULATE });
  await panel.getByRole('button', { name: 'Marcar como requisito de…' }).click();
  await panel.getByLabel('Objetivo', { exact: true }).selectOption({ label: INTERPRET });
  await panel.getByRole('radio', { name: 'Indispensable' }).check();
  await panel.getByRole('button', { name: 'Guardar' }).click();
  await expect(panel.getByRole('region', { name: 'Es requisito de' })).toContainText(INTERPRET);
  await page.keyboard.press('Escape');
  await goToDestination(page, 'Estudiar');
  const note = page.getByRole('note', { name: 'Requisito' });
  await expect(note).toContainText('Antes conviene: Calcular la media y el desvío');
  await expect(note).toContainText(
    'Por qué: «Interpretar un intervalo de confianza» necesita «Calcular la media y el desvío», que todavía está en «Sin iniciar».',
  );
  // En el requisito, desde Progreso.
  await goToDestination(page, 'Progreso');
  await page.getByRole('button', { name: CALCULATE, exact: true }).click();
  await page
    .getByRole('dialog', { name: CALCULATE })
    .getByRole('button', { name: 'Esto no es necesario para aquello' })
    .click();
  await expect(
    page.getByRole('dialog', { name: CALCULATE }).getByText('Listo: ese requisito ya no frena.'),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await goToDestination(page, 'Estudiar');
  await expect(page.getByRole('button', { name: 'Empezar', exact: true })).toBeEnabled();
  await expect(page.getByRole('note', { name: 'Requisito' })).toHaveCount(0);
  await expect(page.getByText(CALCULATE)).toHaveCount(0);
});

test('[CA-154] la tarjeta de los 4 fallos está en «Mejorar la tarjeta» con sus cuatro opciones y «Ver en el original» abre la página de su cita', async ({
  launch,
}) => {
  const { page } = await launch();
  await goToDestination(page, 'Progreso');
  await progressSections(page).getByRole('button', { name: 'Mejorar la tarjeta' }).click();
  const item = itemWith(page, NINETY_FIVE);
  await expect(item).toContainText('4 fallos');
  for (const name of ['Reformular', 'Dividir en dos', 'Agregar una pista', 'Ver en el original']) {
    await expect(item.getByRole('button', { name })).toBeEnabled();
  }
  await item.getByRole('button', { name: 'Ver en el original' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Materiales' })).toBeVisible();
  // La página de la cita (la 6, con «3.2 Qué significa el 95 %»).
  await expect(page.getByText('Página 6 de 12')).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole('heading', { level: 4, name: '3.2 Qué significa el 95 %' }),
  ).toBeVisible();
});

test('[CA-155] [CA-153] un fallo en una respuesta corta: la tercera línea dice qué sigue y por qué, y «Mis errores» guarda lo escrito, la correcta y el tipo', async ({
  launch,
}) => {
  const { page } = await launch();
  await goTo(page, 'Tarjetas');
  await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('exercise');
  await itemWith(page, 'Capital de Francia')
    .getByRole('button', { name: 'Practicar ahora' })
    .click();
  await page.getByPlaceholder('Tu respuesta…').fill('xkcd');
  await page.getByRole('button', { name: 'Enviar' }).click();
  const result = page.locator('[data-component="result"]');
  await expect(result.getByText('Todavía no.', { exact: true })).toBeVisible();
  await expect(result.getByText('Mirá la explicación: parece un olvido.')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await goToDestination(page, 'Progreso');
  await progressSections(page).getByRole('button', { name: 'Mis errores' }).click();
  const group = page.getByRole('region', { name: 'Errores de Sin tema' });
  await expect(group).toContainText('Capital de Francia');
  await expect(group).toContainText('Tu respuesta: xkcd');
  await expect(group).toContainText('La correcta: París');
  const type = group.getByLabel('Tipo de error', { exact: true });
  await expect(type).toHaveValue('forgotten');
  await type.selectOption({ label: 'Distracción' });
  await expect(page.getByText('Tipo de error guardado.')).toBeVisible();
  await goToDestination(page, 'Estudiar');
  await goToDestination(page, 'Progreso');
  await progressSections(page).getByRole('button', { name: 'Mis errores' }).click();
  await expect(
    page
      .getByRole('region', { name: 'Errores de Sin tema' })
      .getByLabel('Tipo de error', { exact: true }),
  ).toHaveValue('distraction');
});
