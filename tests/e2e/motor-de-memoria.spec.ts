import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { createCard, goTo, itemWith, openCardByQuestion, openSubjects } from './pasos';

// El motor de memoria de la Fase 09 en Retenia (prueba) entero, con el elenco y la fecha fija
// (lunes 15/03/2027): las fechas de CA-058 y CA-060, «Deshacer» un repaso y «¿Por qué hoy?».

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function gradeNewest(page: Page, question: string, grade: string) {
  await itemWith(page, question).getByRole('button', { name: 'Repasar' }).click();
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: grade, exact: true }).click();
}

test('[CA-058] una tarjeta nueva suelta con «Con dudas» vuelve el martes 16/03/2027', async ({
  launch,
}) => {
  const { page } = await launch();
  await createCard(page, 'Pregunta suelta de la Fase 09', 'Respuesta');
  await gradeNewest(page, 'Pregunta suelta de la Fase 09', 'Con dudas');
  await expect(page.getByText('Próximo repaso: martes 16/03/2027')).toBeVisible();
});

test('[CA-060] en «Historia argentina», que está en mantenimiento, una tarjeta nueva con «La sabía» vuelve el viernes 19/03/2027', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  const dialog = await openSubjects(page);
  await dialog
    .getByRole('listitem')
    .filter({ hasText: 'Historia argentina' })
    .getByRole('button', { name: 'Abrir' })
    .click();
  await expect(page.getByText('Estás mirando: Historia argentina')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Secciones de Apuntes' })
    .getByRole('button', { name: 'Tarjetas', exact: true })
    .click();
  await expect(page.getByText('12 tarjetas')).toBeVisible();
  await createCard(page, '¿Quién escribió el Plan de Operaciones?', 'Mariano Moreno');
  await gradeNewest(page, '¿Quién escribió el Plan de Operaciones?', 'La sabía');
  await expect(page.getByText('Próximo repaso: viernes 19/03/2027')).toBeVisible();
});

test('[CA-063] «Deshacer» después de «La sabía» devuelve el próximo repaso de antes y el historial dice «Anulado»', async ({
  launch,
}) => {
  const { page } = await launch();
  await openCardByQuestion(page, '¿Qué es la varianza?');
  const before = (await page.getByText(/^Próximo repaso: /).textContent()) ?? '';
  expect(before).toMatch(/^Próximo repaso: \S+ \d{2}\/\d{2}\/\d{4}$/);

  await page.getByRole('button', { name: 'Repasar' }).click();
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: 'La sabía', exact: true }).click();
  const after = page.getByText(/^Próximo repaso: /);
  await expect(after).toBeVisible();
  await expect(after).not.toHaveText(before);

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByText(`Repaso anulado. ${before}`)).toBeVisible();
  await page.getByRole('button', { name: 'Volver a las tarjetas' }).click();
  await openCardByQuestion(page, '¿Qué es la varianza?');
  await expect(page.getByText(/^Próximo repaso: /)).toHaveText(before);

  await page.getByRole('button', { name: 'Historial' }).click();
  const rows = page.getByRole('list', { name: 'Repasos de la tarjeta' }).getByRole('listitem');
  await expect(rows.last()).toHaveText('15/03/2027 · La sabía · Anulado');

  // Y los datos siguen sanos: recalcular desde el historial da lo mismo que lo guardado.
  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: 'Verificar datos' }).click();
  await expect(page.getByText('Todo en orden · 0 diferencias')).toBeVisible();
});

test('[CA-065] «¿Por qué hoy?» en «¿Qué mide el desvío estándar?»: hace 23 días, te costó, unos 7 de cada 10', async ({
  launch,
}) => {
  const { page } = await launch();
  await openCardByQuestion(page, '¿Qué mide el desvío estándar?');
  await page.getByRole('button', { name: '¿Por qué hoy?' }).click();
  await expect(
    page.getByText(
      'La viste hace 23 días; la última vez te costó; probabilidad estimada de recordarla: unos 7 de cada 10',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText('Estimación general (sin datos tuyos)')).toBeVisible();
});

test('«¿Por qué hoy?» en «¿Qué significa el 95 % en un intervalo de confianza del 95 %?»: ayer, no te salió, unos 6 de cada 10', async ({
  launch,
}) => {
  const { page } = await launch();
  await openCardByQuestion(page, '¿Qué significa el 95 % en un intervalo de confianza del 95 %?');
  await page.getByRole('button', { name: '¿Por qué hoy?' }).click();
  await expect(
    page.getByText(
      'La viste hace 1 día; la última vez no te salió; probabilidad estimada de recordarla: unos 6 de cada 10',
      { exact: true },
    ),
  ).toBeVisible();
});

test('accesibilidad: «¿Por qué hoy?», el repaso con «Deshacer» y el historial con «Anulado» no tienen faltas según axe-core, en claro y en oscuro', async ({
  launch,
}) => {
  const { page } = await launch();
  await page.evaluate(AXE);
  const violations = async () => {
    const found: string[] = [];
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const list = await page.evaluate(async () => {
        const axe = (
          globalThis as unknown as {
            axe: {
              run: (
                context: Document,
                options: object,
              ) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>;
            };
          }
        ).axe;
        const outcome = await axe.run(document, { resultTypes: ['violations'] });
        return outcome.violations.map((v) => `${v.id} (${v.nodes.length})`);
      });
      found.push(...list.map((item) => `tema ${theme}: ${item}`));
    }
    return found;
  };
  await openCardByQuestion(page, '¿Qué mide el desvío estándar?');
  await page.getByRole('button', { name: '¿Por qué hoy?' }).click();
  await expect(page.getByText('Estimación general (sin datos tuyos)')).toBeVisible();
  expect(await violations(), 'tarjeta con «¿Por qué hoy?»').toEqual([]);
  await page.getByRole('button', { name: 'Repasar' }).click();
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: 'Con dudas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Deshacer' })).toBeVisible();
  expect(await violations(), 'repaso con «Deshacer»').toEqual([]);
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByText(/^Repaso anulado\./)).toBeVisible();
  expect(await violations(), 'repaso anulado').toEqual([]);
  await page.getByRole('button', { name: 'Volver a las tarjetas' }).click();
  await openCardByQuestion(page, '¿Qué mide el desvío estándar?');
  await page.getByRole('button', { name: 'Historial' }).click();
  await expect(page.getByText(/· Anulado$/)).toBeVisible();
  expect(await violations(), 'historial con «Anulado»').toEqual([]);
});
