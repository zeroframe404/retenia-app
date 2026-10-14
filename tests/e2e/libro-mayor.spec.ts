import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test } from './apoyo';
import { advanceDemoDate, goTo, itemWith, review, ribbon } from './pasos';

// Punta a punta de H-04 sobre Retenia (prueba) empaquetada, con la fecha de demostración
// (lunes 15/03/2027) y una carpeta de datos nueva por prueba, que arranca con las tres tarjetas
// de ejemplo.

const QUESTION = '¿Qué mide el desvío estándar?';

test('[CA-015] repasar «¿Qué mide el desvío estándar?» el 15/03 con «La sabía» y, después de «+7 días», con «Con dudas» deja dos renglones en «Historial»', async ({
  appWindow,
}) => {
  await expect(ribbon(appWindow)).toHaveText('DEMOSTRACIÓN · hoy es lunes 15/03/2027');
  await review(appWindow, QUESTION, 'La sabía');
  await advanceDemoDate(appWindow, '+7 días');
  await expect(ribbon(appWindow)).toHaveText('DEMOSTRACIÓN · hoy es lunes 22/03/2027');
  await goTo(appWindow, 'Tarjetas');
  await review(appWindow, QUESTION, 'Con dudas');
  await itemWith(appWindow, QUESTION).getByRole('button', { name: 'Historial' }).click();
  const rows = appWindow.getByRole('list', { name: 'Repasos de la tarjeta' }).getByRole('listitem');
  await expect(rows).toHaveText(['15/03/2027 · La sabía', '22/03/2027 · Con dudas']);
  await expect(ribbon(appWindow)).toHaveText('DEMOSTRACIÓN · hoy es lunes 22/03/2027');
});

test('[CA-016] Ajustes › «Datos y copias» › «Verificar datos» muestra «Todo en orden · 0 diferencias»', async ({
  appWindow,
}) => {
  await review(appWindow, QUESTION, 'La sabía');
  await goTo(appWindow, 'Ajustes');
  await expect(appWindow.getByRole('heading', { name: 'Datos y copias' })).toBeVisible();
  await appWindow.getByRole('button', { name: 'Verificar datos' }).click();
  await expect(appWindow.getByText('Todo en orden · 0 diferencias')).toBeVisible();
});

test('[CA-016] una agenda tocada con Retenia cerrado aparece en «Verificar datos» y «Reparar desde el historial» la deja en 0', async ({
  launch,
  dataDir,
}) => {
  const first = await launch();
  await review(first.page, QUESTION, 'La sabía');
  await first.close();

  const raw = new Database(join(dataDir, 'retenia.db'));
  raw
    .prepare(
      "UPDATE card_schedule SET due_at = '2027-04-30T13:00:00.000Z' WHERE card_id = (SELECT c.id FROM cards c JOIN card_versions v ON v.id = c.current_version_id WHERE v.question = ?)",
    )
    .run(QUESTION);
  raw.close();

  const second = await launch();
  await goTo(second.page, 'Ajustes');
  await second.page.getByRole('button', { name: 'Verificar datos' }).click();
  await expect(second.page.getByText('Hay 1 diferencia')).toBeVisible();
  await expect(
    second.page.getByRole('list', { name: 'Diferencias' }).getByRole('listitem'),
  ).toHaveText([
    '«¿Qué mide el desvío estándar?»: el próximo repaso guardado es el 30/04/2027; según el historial es el 17/03/2027',
  ]);
  await second.page.getByRole('button', { name: 'Reparar desde el historial' }).click();
  await expect(second.page.getByText('Todo en orden · 0 diferencias')).toBeVisible();
  await goTo(second.page, 'Tarjetas');
  await expect(itemWith(second.page, QUESTION)).toContainText(
    'Próximo repaso: miércoles 17/03/2027',
  );
});

test('[CA-017] cortar Retenia a la fuerza apenas se toca «La sabía» deja el repaso entero o ausente, y «Verificar datos» da 0 diferencias', async ({
  launch,
}) => {
  const first = await launch();
  await itemWith(first.page, QUESTION).getByRole('button', { name: 'Repasar' }).click();
  await first.page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  const child = first.app.process();
  const exited = new Promise((done) => child.once('exit', done));
  await first.page.getByRole('button', { name: 'La sabía', exact: true }).click();
  // A la fuerza: sin cerrar la ventana ni la base.
  child.kill('SIGKILL');
  await exited;

  const second = await launch();
  await itemWith(second.page, QUESTION).getByRole('button', { name: 'Historial' }).click();
  const rows = second.page
    .getByRole('list', { name: 'Repasos de la tarjeta' })
    .getByRole('listitem');
  const empty = second.page.getByText('Todavía no la repasaste.');
  await expect(rows.or(empty).first()).toBeVisible();
  const count = await rows.count();
  expect(count === 0 || count === 1, `renglones del historial: ${count}`).toBe(true);
  if (count === 1) {
    await expect(rows).toHaveText(['15/03/2027 · La sabía']);
  }
  await goTo(second.page, 'Ajustes');
  await second.page.getByRole('button', { name: 'Verificar datos' }).click();
  await expect(second.page.getByText('Todo en orden · 0 diferencias')).toBeVisible();
});
