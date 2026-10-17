import { expect, test } from './apoyo';
import { advanceDemoDate, goTo, itemWith, review } from './pasos';

// Punta a punta de H-05: copias en Ajustes › «Datos y copias», sobre Retenia (prueba)
// empaquetada. Al abrir una carpeta nueva por primera vez, Retenia ya hace una copia automática.

const QUESTION = '¿Qué mide el desvío estándar?';
const copies = (page: import('@playwright/test').Page) =>
  page.getByRole('list', { name: 'Tus copias' }).getByRole('listitem');

test('[CA-019] «Hacer copia ahora» suma a la lista una copia con fecha 15/03/2027, su tamaño y «Verificada»', async ({
  appWindow,
}) => {
  await goTo(appWindow, 'Ajustes');
  // La automática de la primera vez.
  await expect(copies(appWindow)).toHaveCount(1);
  await expect(copies(appWindow).first()).toContainText('15/03/2027 10:00 · Automática');
  await appWindow.getByRole('button', { name: 'Hacer copia ahora' }).click();
  await expect(appWindow.getByText('Copia hecha y verificada.')).toBeVisible({ timeout: 20_000 });
  await expect(copies(appWindow)).toHaveCount(2);
  const made = copies(appWindow).filter({ hasText: 'Hecha por vos' });
  await expect(made).toHaveCount(1);
  await expect(made).toContainText(/15\/03\/2027 10:00 · Hecha por vos · \d+ KB/);
  await expect(made).toContainText('Verificada');
});

test('[CA-020] eliminar «¿Qué mide el desvío estándar?», vaciar la papelera y restaurar la copia la devuelve con sus dos renglones, y aparece «Antes de restaurar»', async ({
  appWindow,
}) => {
  await review(appWindow, QUESTION, 'La sabía');
  await advanceDemoDate(appWindow, '+7 días');
  await goTo(appWindow, 'Tarjetas');
  await review(appWindow, QUESTION, 'Con dudas');
  await goTo(appWindow, 'Ajustes');
  await appWindow.getByRole('button', { name: 'Hacer copia ahora' }).click();
  await expect(copies(appWindow).filter({ hasText: 'Hecha por vos' })).toContainText('22/03/2027');

  await goTo(appWindow, 'Tarjetas');
  await itemWith(appWindow, QUESTION).getByRole('button', { name: 'Eliminar' }).click();
  await expect(appWindow.getByText('La tarjeta está en la Papelera.')).toBeVisible();
  await expect(itemWith(appWindow, QUESTION)).toHaveCount(0);
  await goTo(appWindow, 'Papelera');
  await appWindow.getByRole('button', { name: 'Vaciar papelera' }).click();
  await appWindow.getByRole('button', { name: 'Vaciar', exact: true }).click();
  await expect(appWindow.getByText('La papelera está vacía.')).toBeVisible();

  await goTo(appWindow, 'Ajustes');
  await copies(appWindow)
    .filter({ hasText: 'Hecha por vos' })
    .getByRole('button', { name: 'Restaurar' })
    .click();
  await expect(
    appWindow.getByText(
      'Listo: volviste a la copia del 22/03/2027 10:00. Lo que había antes quedó en la copia «Antes de restaurar».',
    ),
  ).toBeVisible({ timeout: 20_000 });
  await expect(copies(appWindow).filter({ hasText: 'Antes de restaurar' })).toHaveCount(1);

  await goTo(appWindow, 'Tarjetas');
  await itemWith(appWindow, QUESTION).getByRole('button', { name: 'Historial' }).click();
  await expect(
    appWindow.getByRole('list', { name: 'Repasos de la tarjeta' }).getByRole('listitem'),
  ).toHaveText(['15/03/2027 · La sabía', '22/03/2027 · Con dudas']);
});

test('[CA-021] con «+1 día», al cerrar y abrir Retenia hace sola una copia automática con la fecha del día siguiente', async ({
  launch,
}) => {
  const first = await launch();
  await advanceDemoDate(first.page, '+1 día');
  await expect(copies(first.page)).toHaveCount(1);
  await first.close();

  const second = await launch();
  await goTo(second.page, 'Ajustes');
  await expect(copies(second.page)).toHaveCount(2);
  await expect(copies(second.page).first()).toContainText('16/03/2027 10:00 · Automática');
  await expect(copies(second.page).first()).toContainText('Verificada');
  await second.close();

  // Abrir otra vez el mismo día no hace otra.
  const third = await launch();
  await goTo(third.page, 'Ajustes');
  await expect(copies(third.page)).toHaveCount(2);
});
