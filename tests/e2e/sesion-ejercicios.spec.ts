import { expect, test } from './apoyo';
import { advanceDemoDate, goToDestination, untilExercise } from './pasos';

// Los ejercicios en la sesión de Estudiar (Fase 18), en Retenia (prueba) con el elenco: el 16/03
// les toca el repaso a los que ya tienen historial.

const NUMBER_FIELD = 'Tu respuesta, con coma o con punto';

test('al otro día, la sesión empieza con una tarjeta y trae un ejercicio vencido: se contesta ahí y sigue', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await advanceDemoDate(page, '+1 día');
  await goToDestination(page, 'Estudiar');
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mostrar respuesta' })).toBeVisible();

  const exercise = await untilExercise(page);
  const before = await page.getByRole('status', { name: /^Llevás/ }).innerText();
  const number = exercise.getByRole('textbox', { name: NUMBER_FIELD });
  const choice = exercise.getByRole('radio').first();
  await expect(number.or(choice)).toBeVisible();
  if (await number.isVisible()) {
    await number.fill('1');
  } else {
    await choice.check();
  }
  await exercise.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByRole('button', { name: 'Deshacer' })).toHaveCount(0);
  await exercise.getByRole('button', { name: 'Siguiente' }).click();

  await expect(page.getByRole('button', { name: 'Mostrar respuesta' })).toBeVisible();
  await expect(page.getByRole('status', { name: /^Llevás/ })).not.toHaveText(before);
  await page.getByRole('button', { name: 'Pausar' }).click();
  await expect(page.getByRole('button', { name: /^Continuar: sesión de hoy/ })).toBeVisible();
});
