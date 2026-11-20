import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { goTo, goToDestination, openCardByQuestion, openSubjects } from './pasos';

// Importar de Anki y RemNote, «Exportar todo» e «Importar exportación» (H-29, H-30, Fase 15) de
// punta a punta, sobre Retenia (prueba) empaquetada y con el elenco. Los diálogos de Windows son un
// doble declarado (docs/plan-de-pruebas.md): la prueba los reemplaza en el proceso principal para que
// devuelvan el archivo de ejemplo o la ruta donde guardar.

const SAMPLES = join(import.meta.dirname, '..', '..', 'datos-de-ejemplo');
const SLOW = { timeout: 30_000 };

async function answerOpen(app: ElectronApplication, path: string) {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [chosen],
    })) as typeof dialog.showOpenDialog;
  }, path);
}

async function answerSave(app: ElectronApplication, path: string) {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath: chosen,
    })) as typeof dialog.showSaveDialog;
  }, path);
}

const preview = (page: Page) =>
  page.getByRole('region', { name: 'Vista previa de la importación' });

test('[CA-122] [CA-126] Anki: la vista previa no escribe nada; «Importar» a «Historia argentina» deja las 3 tarjetas con su historial, su próximo repaso y una copia «Antes de importar»', async ({
  launchFromStart,
}) => {
  const { page, app } = await launchFromStart();
  await goTo(page, 'Ajustes');
  await answerOpen(app, join(SAMPLES, 'mazo-demo.apkg'));
  await page.getByRole('button', { name: 'Importar de Anki' }).click();
  await expect(
    preview(page).getByText('Entran 3 tarjetas y 5 repasos · Rechazadas: 0'),
  ).toBeVisible(SLOW);
  await expect(preview(page).getByText('Todavía no se escribió nada en Retenia.')).toBeVisible();
  await preview(page)
    .getByLabel('Materia de destino')
    .selectOption({ label: 'Historia argentina' });
  await preview(page).getByRole('button', { name: 'Importar' }).click();
  await expect(
    page.getByText(/^Listo: entraron 3 tarjetas y 5 repasos en «Historia argentina»\./),
  ).toBeVisible(SLOW);
  await expect(
    page
      .getByRole('list', { name: 'Tus copias' })
      .getByRole('listitem')
      .filter({ hasText: 'Antes de importar' }),
  ).toHaveCount(1);

  // Apuntes muestra la materia que se mira: se abre «Historia argentina» sin hacerla activa.
  const subjects = await openSubjects(page);
  await subjects
    .getByRole('listitem')
    .filter({ hasText: 'Historia argentina' })
    .getByRole('button', { name: 'Abrir' })
    .click();
  await goTo(page, 'Tarjetas');
  await openCardByQuestion(page, '¿Quién encabezó el cruce de los Andes en 1817?');
  await page.getByRole('button', { name: 'Historial' }).click();
  const history = page.getByRole('list', { name: 'Repasos de la tarjeta' });
  await expect(history.getByRole('listitem')).toHaveCount(2);
  await expect(history).toContainText('02/02/2027 · La sabía · De Anki');
  await expect(page.getByText(/^Próximo repaso: /)).toBeVisible();
});

test('[CA-124] Anki dos veces: «0 nuevas · 3 ya estaban»', async ({ launchFromStart }) => {
  const { page, app } = await launchFromStart();
  await goTo(page, 'Ajustes');
  await answerOpen(app, join(SAMPLES, 'mazo-demo.apkg'));
  await page.getByRole('button', { name: 'Importar de Anki' }).click();
  await preview(page).getByRole('button', { name: 'Importar' }).click();
  await expect(page.getByText(/^Listo: entraron 3 tarjetas/)).toBeVisible(SLOW);
  await page.getByRole('button', { name: 'Importar de Anki' }).click();
  await expect(preview(page).getByText('0 nuevas · 3 ya estaban')).toBeVisible(SLOW);
  await expect(preview(page).getByRole('button', { name: 'Importar' })).toBeDisabled();
});

test('[CA-123] [CA-125] RemNote: «12 notas, 8 tarjetas, 1 rechazada (imagen faltante)», la nota conserva sus renglones y la lista de rechazadas sigue al volver', async ({
  launchFromStart,
}) => {
  const { page, app } = await launchFromStart();
  await goTo(page, 'Ajustes');
  await answerOpen(app, join(SAMPLES, 'remnote-demo.zip'));
  await page.getByRole('button', { name: 'Importar de RemNote' }).click();
  await expect(
    preview(page).getByText('12 notas, 8 tarjetas, 1 rechazada (imagen faltante)'),
  ).toBeVisible(SLOW);
  await preview(page)
    .getByLabel('Materia de destino')
    .selectOption({ label: 'Historia argentina' });
  await preview(page).getByRole('button', { name: 'Importar' }).click();
  await expect(page.getByText(/^Listo: entraron 12 notas y 8 tarjetas/)).toBeVisible(SLOW);

  // Como en M15.5: ir a Apuntes y volver; la lista de rechazadas sigue en «Importaciones».
  await goTo(page, 'Notas');
  await goTo(page, 'Ajustes');
  const record = page
    .getByRole('list', { name: 'Tus importaciones' })
    .getByRole('listitem')
    .first();
  await record.getByRole('button', { name: 'Ver rechazadas' }).click();
  await expect(
    page
      .getByRole('list', { name: 'Lo que no entró' })
      .getByText('Cruce de los Andes: mapa-del-cruce.png · imagen faltante'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar lista' })).toBeVisible();
});

test('[CA-127] [CA-128] «Exportar todo» y, empezando como la primera vez, «Importar exportación» deja los mismos conteos y 0 diferencias', async ({
  launchFromStart,
  dataDir,
}) => {
  const { page, app } = await launchFromStart();
  await goTo(page, 'Ajustes');
  const file = join(dataDir, '..', `exportacion-${randomUUID().slice(0, 8)}.zip`);
  await answerSave(app, file);
  await page.getByRole('button', { name: 'Exportar todo' }).click();
  const exported = page.getByText(/^Exportado en «exportacion-[0-9a-f]{8}\.zip»: /);
  await expect(exported).toBeVisible(SLOW);
  const counts = /: (.+)\.$/.exec((await exported.textContent()) ?? '')?.[1] ?? '';
  expect(counts).toMatch(/^\d+ materias · \d+ tarjetas · [\d.]+ repasos$/);

  await page.getByRole('button', { name: 'Empezar como la primera vez' }).click();
  await expect(page.getByText('¿Qué querés aprender ahora?')).toBeVisible(SLOW);
  await answerOpen(app, file);
  await page.getByRole('button', { name: 'Importar exportación' }).click();
  await expect(
    page.getByText(new RegExp(`^Exportación del 15/03/2027: ${counts.replace(/[.]/g, '\\.')}\\.$`)),
  ).toBeVisible(SLOW);
  await page.getByRole('button', { name: 'Cargar' }).click();
  await goToDestination(page, 'Ajustes');
  await page.getByRole('button', { name: 'Verificar datos' }).click();
  await expect(page.getByText('Todo en orden · 0 diferencias')).toBeVisible(SLOW);
  await page.getByRole('button', { name: 'Volver al elenco' }).click();
  await goTo(page, 'Ajustes');
  await expect(page.getByRole('button', { name: 'Empezar como la primera vez' })).toBeVisible(SLOW);
});
