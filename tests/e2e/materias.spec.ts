import { expect, test } from './apoyo';
import { goTo, goToDestination, openSubjects, rail, ribbon } from './pasos';

// Materias y primera vez (H-09, CA-038 a CA-041) de punta a punta, sobre Retenia (prueba)
// empaquetada: cada carpeta de datos nueva arranca con el elenco de ejemplo (Estadística básica
// activa, Historia argentina en mantenimiento, Inglés y Ejemplo).

test('[CA-038] crea «Química orgánica» y «Hacer activa»: Estudiar la muestra y «Estadística básica» pasa a «En mantenimiento»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goToDestination(page, 'Estudiar');
  await expect(page.getByRole('main')).toContainText('Estadística básica');

  const dialog = await openSubjects(page);
  await dialog.getByRole('button', { name: 'Nueva materia' }).click();
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill('Química orgánica');
  await dialog.getByRole('button', { name: 'Crear' }).click();
  const created = dialog.getByRole('listitem').filter({ hasText: 'Química orgánica' });
  await expect(created).toBeVisible();
  await created.getByRole('button', { name: 'Hacer activa' }).click();

  await expect(
    dialog.getByRole('listitem').filter({ hasText: 'Estadística básica' }),
  ).toContainText('En mantenimiento');
  await expect(created).toContainText('Activa');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('main')).toContainText('Química orgánica');
  await expect(page.getByRole('main')).not.toContainText('Estadística básica');
});

test('[CA-038] la materia activa sigue siendo la elegida al cerrar y abrir Retenia', async ({
  launchFromStart,
  dataDir,
}) => {
  const first = await launchFromStart();
  const dialog = await openSubjects(first.page);
  await dialog.getByRole('button', { name: 'Nueva materia' }).click();
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill('Química orgánica');
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'Química orgánica' })
    .getByRole('button', { name: 'Hacer activa' })
    .click();
  await first.close();

  const second = await launchFromStart(dataDir);
  await goToDestination(second.page, 'Estudiar');
  await expect(second.page.getByRole('main')).toContainText('Química orgánica');
});

test('[CA-038] el nombre de una materia no puede estar vacío ni repetido', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  const dialog = await openSubjects(page);
  await dialog.getByRole('button', { name: 'Nueva materia' }).click();
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await expect(dialog.getByText('Escribí el nombre de la materia')).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill('  estadística BÁSICA ');
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await expect(dialog.getByText('Ya tenés una materia con ese nombre')).toBeVisible();
  await expect(dialog.getByRole('listitem')).toHaveCount(4);
});

test('[CA-039] abrir «Historia argentina» para mirar sus apuntes no la activa: Estudiar sigue con «Estadística básica»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  const dialog = await openSubjects(page);
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'Historia argentina' })
    .getByRole('button', { name: 'Abrir' })
    .click();

  await expect(page.getByRole('heading', { level: 2, name: 'Apuntes' })).toBeVisible();
  await expect(page.getByText('Estás mirando: Historia argentina')).toBeVisible();
  await expect(page.getByText('Materia activa: Estadística básica')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Independencia/ })).toBeVisible();

  await goToDestination(page, 'Estudiar');
  await expect(page.getByRole('main')).toContainText('Estadística básica');
  await expect(page.getByRole('main')).not.toContainText('Historia argentina');
  // Al volver a Apuntes sigue mirando la activa sola: la consulta no se guarda al cerrar.
  await goTo(page, 'Notas');
  await expect(page.getByText('Estás mirando: Historia argentina')).toBeVisible();
});

test('[CA-039] «Hacer activa» en «Historia argentina» recién ahí cambia la materia activa', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  const dialog = await openSubjects(page);
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'Historia argentina' })
    .getByRole('button', { name: 'Hacer activa' })
    .click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('main')).toContainText('Historia argentina');
});

test('[CA-041] «Empezar como la primera vez» deja una sola pregunta: «¿Qué querés aprender ahora?», y al escribir «Química orgánica» queda como materia activa', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: 'Empezar como la primera vez' }).click();

  await expect(page.getByText('¿Qué querés aprender ahora?')).toBeVisible();
  await expect(ribbon(page)).toBeVisible();
  // Nada más que pedir: un solo campo, sin riel.
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await expect(rail(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Agregar mi primer material' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Probar con un ejemplo (3 min)' })).toBeVisible();

  await page.getByRole('textbox', { name: '¿Qué querés aprender ahora?' }).fill('Química orgánica');
  await page.keyboard.press('Enter');

  // Por ahora «Agregar mi primer material» lleva a Materiales, todavía vacío.
  await expect(page.getByRole('heading', { level: 2, name: 'Materiales' })).toBeVisible();
  await goToDestination(page, 'Estudiar');
  await expect(page.getByRole('main')).toContainText('Química orgánica');
});

test('[CA-041] sin escribir nada, «Agregar mi primer material» pide qué querés aprender', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: 'Empezar como la primera vez' }).click();
  await page.getByRole('button', { name: 'Agregar mi primer material' }).click();
  await expect(page.getByText('Escribí qué querés aprender')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '¿Qué querés aprender ahora?' })).toBeFocused();
});

test('[CA-041] «Probar con un ejemplo (3 min)» carga la materia «Ejemplo» con la etiqueta EJEMPLO, y «Volver al elenco» deja el elenco como estaba', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: 'Empezar como la primera vez' }).click();
  await page.getByRole('button', { name: 'Probar con un ejemplo (3 min)' }).click();

  await expect(page.getByRole('heading', { level: 2, name: 'Estudiar' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Ejemplo');
  await expect(page.getByRole('main').getByText('EJEMPLO', { exact: true })).toBeVisible();

  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: 'Volver al elenco' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Estudiar' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Estadística básica');
  const dialog = await openSubjects(page);
  await expect(dialog.getByRole('listitem')).toHaveCount(4);
});

test('[CA-041] si se cierra Retenia en la primera vez, al abrir sigue la pregunta; «Volver al elenco» la saca', async ({
  launchFromStart,
  dataDir,
}) => {
  const first = await launchFromStart();
  await goTo(first.page, 'Ajustes');
  await first.page.getByRole('button', { name: 'Empezar como la primera vez' }).click();
  await expect(first.page.getByText('¿Qué querés aprender ahora?')).toBeVisible();
  await first.close();

  // En la demostración, la pantalla única también trae «Volver al elenco»: sin riel no habría otra
  // forma de salir de ahí.
  const second = await launchFromStart(dataDir);
  await expect(second.page.getByText('¿Qué querés aprender ahora?')).toBeVisible();
  await second.page.getByRole('button', { name: 'Volver al elenco' }).click();
  await expect(second.page.getByRole('heading', { level: 2, name: 'Estudiar' })).toBeVisible();
  await expect(second.page.getByRole('main')).toContainText('Estadística básica');
  await second.close();
});
