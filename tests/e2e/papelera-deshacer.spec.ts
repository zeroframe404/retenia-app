import { expect, test } from './apoyo';
import { goTo, itemWith, review } from './pasos';

// Punta a punta de H-06: «Papelera» y «Actividad reciente» con «Deshacer», sobre Retenia
// (prueba) empaquetada.

test('[CA-022] eliminar una tarjeta la manda a «Papelera» por 30 días y «Restaurar» la devuelve con su historial', async ({
  appWindow,
}) => {
  const question = '¿Qué es la varianza?';
  await review(appWindow, question, 'La sabía');
  await itemWith(appWindow, question).getByRole('button', { name: 'Eliminar' }).click();
  await expect(itemWith(appWindow, question)).toHaveCount(0);

  await goTo(appWindow, 'Papelera');
  const row = appWindow
    .getByRole('list', { name: 'Elementos en la papelera' })
    .getByRole('listitem');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(question);
  await expect(row).toContainText('Se elimina para siempre el 14/04/2027');
  await row.getByRole('button', { name: 'Restaurar' }).click();
  await expect(appWindow.getByText('La tarjeta volvió a la lista.')).toBeVisible();

  await goTo(appWindow, 'Tarjetas');
  await expect(itemWith(appWindow, question)).toContainText('Próximo repaso: miércoles 17/03/2027');
  await itemWith(appWindow, question).getByRole('button', { name: 'Historial' }).click();
  await expect(
    appWindow.getByRole('list', { name: 'Repasos de la tarjeta' }).getByRole('listitem'),
  ).toHaveText(['15/03/2027 · La sabía']);
});

test('[CA-023] editar la pregunta agregando PRUEBA y tocar «Deshacer» en «Actividad reciente» la deja sin PRUEBA', async ({
  appWindow,
}) => {
  const question = '¿Qué es la varianza?';
  await itemWith(appWindow, question).getByRole('button', { name: 'Editar' }).click();
  const field = appWindow.getByRole('textbox', { name: 'Pregunta' });
  await field.fill(`${question} PRUEBA`);
  await appWindow.getByRole('button', { name: 'Guardar' }).click();
  await expect(appWindow.getByText('Cambios guardados')).toBeVisible();
  await expect(itemWith(appWindow, `${question} PRUEBA`)).toHaveCount(1);

  await goTo(appWindow, 'Actividad reciente');
  const row = appWindow
    .getByRole('list', { name: 'Tus cambios' })
    .getByRole('listitem')
    .filter({ hasText: `Editaste «${question} PRUEBA»` });
  await expect(row).toContainText('15/03/2027 10:00');
  await row.getByRole('button', { name: 'Deshacer' }).click();
  await expect(appWindow.getByText('Listo: deshiciste el cambio.')).toBeVisible();

  await goTo(appWindow, 'Tarjetas');
  await expect(itemWith(appWindow, 'PRUEBA')).toHaveCount(0);
  await expect(itemWith(appWindow, question)).toHaveCount(1);
});

test('«Actividad reciente» no muestra las tarjetas de ejemplo como cambios tuyos', async ({
  appWindow,
}) => {
  await goTo(appWindow, 'Actividad reciente');
  await expect(appWindow.getByText('Todavía no hiciste cambios.')).toBeVisible();
});
