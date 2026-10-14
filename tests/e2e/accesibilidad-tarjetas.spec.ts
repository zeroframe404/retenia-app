import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

type AxeRun = (
  context: Document,
  options: object,
) => Promise<{ violations: { id: string; help: string; nodes: unknown[] }[] }>;

// Las faltas de accesibilidad que axe-core encuentra en lo que se ve ahora, en claro y en oscuro.
async function violationsNow(page: Page): Promise<string[]> {
  const found: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    const violations = await page.evaluate(async () => {
      const axe = (globalThis as unknown as { axe: { run: AxeRun } }).axe;
      const outcome = await axe.run(document, { resultTypes: ['violations'] });
      return outcome.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`);
    });
    found.push(...violations.map((violation) => `tema ${theme}: ${violation}`));
  }
  return found;
}

test('accesibilidad: la lista, el formulario (con y sin avisos) y el repaso no tienen faltas según axe-core, en claro y en oscuro', async ({
  appWindow,
}) => {
  await expect(appWindow.getByRole('heading', { level: 2, name: 'Tarjetas' })).toBeVisible();
  await appWindow.evaluate(AXE);

  // La lista con las tres tarjetas de ejemplo.
  await expect(appWindow.getByRole('listitem')).toHaveCount(3);
  expect(await violationsNow(appWindow), 'lista').toEqual([]);

  // El formulario vacío y con el aviso «Escribí la pregunta».
  await appWindow.getByRole('button', { name: 'Nueva tarjeta' }).click();
  expect(await violationsNow(appWindow), 'formulario').toEqual([]);
  await appWindow.getByRole('textbox', { name: 'Respuesta' }).fill('Roma');
  await appWindow.getByRole('button', { name: 'Guardar' }).click();
  await expect(appWindow.getByText('Escribí la pregunta')).toBeVisible();
  expect(await violationsNow(appWindow), 'formulario con aviso').toEqual([]);

  // La lista con el cartel «Tarjeta guardada».
  await appWindow.getByRole('textbox', { name: 'Pregunta' }).fill('¿Capital de Italia?');
  await appWindow.getByRole('button', { name: 'Guardar' }).click();
  await expect(appWindow.getByText('Tarjeta guardada')).toBeVisible();
  expect(await violationsNow(appWindow), 'lista con cartel').toEqual([]);

  // El repaso: pregunta, respuesta con las tres calificaciones y resultado.
  await appWindow.getByRole('listitem').first().getByRole('button', { name: 'Repasar' }).click();
  expect(await violationsNow(appWindow), 'repaso: pregunta').toEqual([]);
  await appWindow.getByRole('button', { name: 'Mostrar respuesta' }).click();
  expect(await violationsNow(appWindow), 'repaso: respuesta').toEqual([]);
  await appWindow.getByRole('button', { name: 'La sabía', exact: true }).click();
  await expect(appWindow.getByText('Próximo repaso: miércoles 17/03/2027')).toBeVisible();
  expect(await violationsNow(appWindow), 'repaso: resultado').toEqual([]);
});
