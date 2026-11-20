import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { goTo, goToDestination, openCardByQuestion } from './pasos';

// Importar materiales (H-25 y H-26) de punta a punta en «Retenia (prueba)» empaquetado, como lo
// usa una persona: por el texto que se ve, arrastrando archivos de verdad y eligiéndolos.

const SAMPLES = resolve(import.meta.dirname, '../../datos-de-ejemplo');
const INFERENCE = 'Inferencia — capítulos 1 a 4.pdf';
const SLOW = { timeout: 60_000 };

const main = (page: Page) => page.getByRole('main');
// Donde se sueltan los archivos: algo de adentro de la pantalla (el suelte sube hasta ella), como
// cuando se arrastra desde el Explorador.
const dropTarget = (page: Page) => page.getByRole('heading', { level: 2, name: 'Materiales' });
const materialItem = (page: Page, name: RegExp) => main(page).getByRole('button', { name });

// Arrastrar archivos del disco sobre la pantalla: los archivos se toman de un selector de archivos
// aparte (así son archivos de verdad, con su ruta) y se sueltan con un DataTransfer, igual que al
// arrastrarlos desde el Explorador.
async function dropFiles(page: Page, target: Locator, paths: string[]) {
  const picker = await page.evaluateHandle(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.hidden = true;
    document.body.append(input);
    return input;
  });
  await picker.setInputFiles(paths);
  const transfer = await page.evaluateHandle((input) => {
    const data = new DataTransfer();
    for (const file of Array.from(input.files ?? [])) {
      data.items.add(file);
    }
    input.remove();
    return data;
  }, picker);
  await target.dispatchEvent('dragenter', { dataTransfer: transfer });
  await target.dispatchEvent('dragover', { dataTransfer: transfer });
  await target.dispatchEvent('drop', { dataTransfer: transfer });
}

async function toMaterials(page: Page) {
  await goToDestination(page, 'Materiales');
  await expect(page.getByRole('heading', { level: 2, name: 'Materiales' })).toBeVisible();
}

async function slowProcessing(page: Page, on: boolean) {
  await goTo(page, 'Ajustes');
  const box = page.getByRole('checkbox', { name: 'Procesar despacio' });
  if ((await box.isChecked()) !== on) {
    await box.click();
  }
  await expect(box).toBeChecked({ checked: on });
}

function copyAs(folder: string, name: string, as: string): string {
  mkdirSync(folder, { recursive: true });
  const target = join(folder, as);
  copyFileSync(join(SAMPLES, name), target);
  return target;
}

test('[CA-104] arrastrar «Inferencia — capítulos 1 a 4.pdf»: las etapas avanzan con sus conteos hasta «Listo», sin un indicador sin dato', async ({
  launchFromStart,
  dataDir,
}) => {
  writeFileSync(join(dataDir, 'demo-modo.json'), '{"mode":"first-time"}\n');
  const { page } = await launchFromStart();
  await page
    .getByRole('textbox', { name: '¿Qué querés aprender ahora?' })
    .fill('Estadística básica');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Materiales' })).toBeVisible();
  await dropFiles(page, dropTarget(page), [join(SAMPLES, INFERENCE)]);
  const item = materialItem(page, /Inferencia — capítulos 1 a 4/);
  await item.click();
  const stages = page.getByRole('list', { name: 'Etapas del procesamiento' });
  await expect(stages.getByText('Archivo guardado')).toBeVisible();
  await expect(stages.getByText('Texto extraído (11 de 12 páginas)')).toBeVisible(SLOW);
  await expect(stages.getByText('Secciones detectadas')).toBeVisible();
  await expect(item).toContainText('Listo', SLOW);
  await expect(page.locator('[aria-busy="true"]:not(:has-text(" de "))')).toHaveCount(0);
});

test('[CA-104] «Elegir archivo» hace lo mismo que arrastrar', async ({ launchFromStart }) => {
  const { page } = await launchFromStart();
  await toMaterials(page);
  await page.getByRole('button', { name: 'Agregar material' }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar material' });
  await dialog.getByLabel('Elegir archivo').setInputFiles(join(SAMPLES, 'resumen.docx'));
  await expect(materialItem(page, /resumen/)).toContainText('Listo', SLOW);
});

test('[CA-105] cerrar Retenia a mitad del procesamiento: al volver a abrir sigue solo hasta «Listo» y el original está', async ({
  launchFromStart,
  dataDir,
}, testInfo) => {
  const first = await launchFromStart();
  await slowProcessing(first.page, true);
  await toMaterials(first.page);
  const file = copyAs(testInfo.outputPath('archivos'), INFERENCE, 'Otro PDF.pdf');
  await dropFiles(first.page, dropTarget(first.page), [file]);
  const duplicate = first.page.getByRole('dialog', { name: /^Parece que ya agregaste/ });
  await duplicate.getByRole('button', { name: 'Agregar igual' }).click();
  await expect(materialItem(first.page, /Otro PDF/)).toContainText(/Procesando [3-9] de 12/, SLOW);
  // A la fuerza, como «Finalizar árbol de procesos» del Administrador de tareas: Retenia, su
  // ventana y su proceso de materiales mueren sin cerrar nada.
  const child = first.app.process();
  const exited = new Promise((done) => child.once('exit', done));
  execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  await exited;
  rmSync(file);
  const second = await launchFromStart(dataDir);
  await toMaterials(second.page);
  await expect(materialItem(second.page, /Otro PDF/)).toContainText('Listo', { timeout: 120_000 });
  await slowProcessing(second.page, false);
});

test('[CA-106] arrastrar «Apunte 3.pdf» otra vez: «Parece que ya agregaste “Apunte 3.pdf” el 12/03/2027» con las tres opciones', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await toMaterials(page);
  await dropFiles(page, dropTarget(page), [join(SAMPLES, 'Apunte 3.pdf')]);
  const dialog = page.getByRole('dialog', {
    name: 'Parece que ya agregaste “Apunte 3.pdf” el 12/03/2027',
  });
  await expect(dialog).toBeVisible();
  for (const name of ['Abrir el existente', 'Agregar como nueva versión', 'Agregar igual']) {
    await expect(dialog.getByRole('button', { name })).toBeVisible();
  }
  await dialog.getByRole('button', { name: 'Abrir el existente' }).click();
  await expect(materialItem(page, /Apunte 3/)).toHaveCount(1);
});

test('[CA-107] «notas.md», «resumen.docx» y un texto pegado llegan a «Listo» y se leen por secciones', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await toMaterials(page);
  await dropFiles(page, dropTarget(page), [
    join(SAMPLES, 'notas.md'),
    join(SAMPLES, 'resumen.docx'),
  ]);
  await page.getByRole('button', { name: 'Agregar material' }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar material' });
  await dialog.getByRole('button', { name: 'Pegar texto' }).click();
  await dialog
    .getByRole('textbox', { name: 'Texto' })
    .fill('Primer párrafo pegado.\n\nSegundo párrafo pegado.\n\nTercer párrafo pegado.');
  await dialog.getByRole('button', { name: 'Agregar' }).click();
  for (const name of [/notas/, /resumen/, /Primer párrafo pegado/]) {
    await expect(materialItem(page, name)).toContainText('Listo', SLOW);
  }
  await materialItem(page, /notas/).click();
  await page.getByRole('button', { name: 'Leer el original' }).click();
  for (const section of ['Medidas de centro', 'Dispersión', 'Para la próxima clase']) {
    await expect(page.getByRole('heading', { name: section })).toBeVisible();
  }
});

test('[CA-108] «no-es-un-pdf.pdf»: «No pudimos leer este PDF (protegido o dañado)» con «Elegir otro» y «Pegar el texto», y lo demás sigue andando', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await toMaterials(page);
  await dropFiles(page, dropTarget(page), [join(SAMPLES, 'no-es-un-pdf.pdf')]);
  await materialItem(page, /no-es-un-pdf/).click();
  await expect(page.getByText('No pudimos leer este PDF (protegido o dañado)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Elegir otro' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pegar el texto' })).toBeVisible();
  await goToDestination(page, 'Estudiar');
  await expect(page.getByRole('button', { name: 'Empezar' })).toBeVisible();
  await goToDestination(page, 'Apuntes');
  await expect(page.getByRole('heading', { level: 2, name: 'Apuntes' })).toBeVisible();
});

test('[CA-109] mientras procesa: «Leer el original», estudiar otra cosa y «Cancelar» conserva el original', async ({
  launchFromStart,
}, testInfo) => {
  const { page } = await launchFromStart();
  await slowProcessing(page, true);
  await toMaterials(page);
  // Una copia del PDF del elenco con otro nombre: es un duplicado y se agrega igual.
  const file = copyAs(testInfo.outputPath('archivos'), INFERENCE, 'Apunte 4.pdf');
  await dropFiles(page, dropTarget(page), [file]);
  await page
    .getByRole('dialog', { name: /^Parece que ya agregaste/ })
    .getByRole('button', { name: 'Agregar igual' })
    .click();
  const item = materialItem(page, /Apunte 4/);
  await item.click();
  await page.getByRole('button', { name: 'Leer el original' }).click();
  await expect(page.getByText(/^Página 1 de 12$/)).toBeVisible();
  await goToDestination(page, 'Estudiar');
  await expect(page.getByRole('button', { name: 'Empezar' })).toBeVisible();
  await toMaterials(page);
  await item.click();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('button', { name: 'Seguir procesando' })).toBeVisible();
  await page.getByRole('button', { name: 'Leer el original' }).click();
  await expect(page.getByText(/^Página 1 de 12$/)).toBeVisible();
  await slowProcessing(page, false);
  await toMaterials(page);
  await item.click();
  await page.getByRole('button', { name: 'Seguir procesando' }).click();
  await expect(item).toContainText('Listo', SLOW);
});

async function selectSentence(page: Page, sentence: string) {
  const paragraph = page.getByText(sentence, { exact: false }).first();
  await paragraph.evaluate((element, text) => {
    const node = element.firstChild as Text;
    const start = node.data.indexOf(text);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + text.length);
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }, sentence);
}

async function openInference(page: Page) {
  await toMaterials(page);
  const item = materialItem(page, /Inferencia — capítulos 1 a 4/);
  await expect(item).toContainText('Listo', SLOW);
  await item.click();
  await page.getByRole('button', { name: 'Leer el original' }).click();
}

const PARAMETER =
  'Un parámetro es un número que describe a la población: la media de las alturas de todos los estudiantes, por ejemplo.';

test('[CA-110] una oración de la página 2 se vuelve tarjeta con su cita, y «Ver en el original» abre la página 2 con la oración resaltada', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openInference(page);
  await page.getByRole('button', { name: 'Página siguiente' }).click();
  await expect(page.getByText(/^Página 2 de 12$/)).toBeVisible();
  await selectSentence(page, PARAMETER);
  await page.getByRole('button', { name: 'Crear tarjeta desde acá' }).click();
  const panel = page.getByRole('dialog', { name: 'Crear tarjeta desde acá' });
  await expect(panel.getByText('Inferencia — capítulos 1 a 4 · página 2')).toBeVisible();
  await expect(panel.locator('blockquote')).toHaveText(PARAMETER);
  await panel
    .getByRole('textbox', { name: 'Pregunta' })
    .fill('¿Qué es un parámetro, con un ejemplo?');
  await panel.getByRole('button', { name: 'Guardar' }).click();
  await goTo(page, 'Tarjetas');
  await openCardByQuestion(page, '¿Qué es un parámetro, con un ejemplo?');
  await expect(page.getByText('Fuente: Inferencia — capítulos 1 a 4 · página 2')).toBeVisible();
  await page.getByRole('button', { name: 'Ver en el original' }).click();
  await expect(page.getByText(/^Página 2 de 12$/)).toBeVisible();
  await expect(page.getByRole('img', { name: 'Pasaje resaltado' }).first()).toBeVisible();
});

test('[CA-111] Retenia tiene su copia: se borra el archivo de afuera y el material se sigue abriendo', async ({
  launchFromStart,
}, testInfo) => {
  const { page } = await launchFromStart();
  await toMaterials(page);
  const file = copyAs(testInfo.outputPath('archivos'), 'resumen.docx', 'prueba.docx');
  await dropFiles(page, dropTarget(page), [file]);
  await expect(materialItem(page, /prueba/)).toContainText('Listo', SLOW);
  rmSync(file);
  await materialItem(page, /prueba/).click();
  await page.getByRole('button', { name: 'Leer el original' }).click();
  await expect(page.getByRole('heading', { name: 'Cómo se interpreta' })).toBeVisible();
});

test('[CA-112] «Guardar extracto» manda la selección a la Bandeja con su página', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openInference(page);
  for (let n = 1; n < 3; n++) {
    await page.getByRole('button', { name: 'Página siguiente' }).click();
  }
  await expect(page.getByText(/^Página 3 de 12$/)).toBeVisible();
  await selectSentence(page, 'Queremos un tirador sin sesgo y con poca variabilidad.');
  await page.getByRole('button', { name: 'Guardar extracto' }).click();
  await expect(page.getByText('Extracto guardado en la Bandeja')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Riel lateral' })
    .getByRole('button', { name: /Bandeja/ })
    .click();
  await expect(page.getByText('Inferencia — capítulos 1 a 4 · página 3')).toBeVisible();
});

test('humo S5: la fuente está a un clic: una cita resaltada del PDF lleva a su pasaje en el original', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openInference(page);
  const cited = page.locator('[data-cited="true"]').first();
  await cited.click();
  await page.getByRole('button', { name: 'Ver en el original' }).click();
  await expect(page.getByRole('img', { name: 'Pasaje resaltado' }).first()).toBeVisible();
});

test('M13.8: tres archivos juntos entran a la cola; una foto y un archivo vacío dicen por qué no sirven, sin romper nada', async ({
  launchFromStart,
}, testInfo) => {
  const { page } = await launchFromStart();
  await toMaterials(page);
  const folder = testInfo.outputPath('archivos');
  mkdirSync(folder, { recursive: true });
  const files = ['uno', 'dos', 'tres'].map((name) => {
    const path = join(folder, `${name}.txt`);
    writeFileSync(path, `Archivo ${name}\n\nUn párrafo del archivo ${name}.`);
    return path;
  });
  await dropFiles(page, dropTarget(page), files);
  for (const name of [/^uno/, /^dos/, /^tres/]) {
    await expect(materialItem(page, name)).toContainText('Listo', SLOW);
  }
  const empty = join(folder, 'vacio.txt');
  writeFileSync(empty, '');
  await dropFiles(page, dropTarget(page), [join(SAMPLES, 'campana.png'), empty]);
  await materialItem(page, /campana/).click();
  await expect(
    page.getByText(
      'Retenia lee PDF, Word (.docx), Markdown y texto. Este archivo es de otro tipo.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Elegir otro' })).toBeVisible();
  await materialItem(page, /vacio/).click();
  await expect(page.getByText('Este archivo está vacío')).toBeVisible();
  await goToDestination(page, 'Estudiar');
  await expect(page.getByRole('button', { name: 'Empezar' })).toBeVisible();
});

test('«Ver en el original» desde una sesión: se abre en el panel de la derecha y la tarjeta y el borrador siguen intactos', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  // Primero el PDF del elenco tiene que estar leído (se lee solo al abrir).
  await toMaterials(page);
  await expect(materialItem(page, /Inferencia — capítulos 1 a 4/)).toContainText('Listo', SLOW);
  await goToDestination(page, 'Estudiar');
  await page.getByRole('button', { name: 'Empezar' }).click();
  const answer = page.getByPlaceholder('Tu respuesta…');
  await answer.fill('Un borrador a medio escribir');
  await page.keyboard.press('Control+k');
  await page
    .getByRole('dialog', { name: 'Buscar' })
    .getByRole('combobox', { name: 'Buscar en tus apuntes y tarjetas' })
    .fill('qué es una muestra');
  await page
    .getByRole('dialog', { name: 'Buscar' })
    .getByRole('option')
    .filter({ hasText: '¿Qué es una muestra?' })
    .first()
    .click();
  const panel = page.getByRole('dialog', { name: '¿Qué es una muestra?' });
  await panel.getByRole('button', { name: 'Ver en el original' }).click();
  await expect(panel.getByRole('img', { name: 'Pasaje resaltado' }).first()).toBeVisible(SLOW);
  await page.keyboard.press('Escape');
  await expect(answer).toHaveValue('Un borrador a medio escribir');
});

test('«Ver en el original» desde la búsqueda: una sección del PDF abre el visor en su página', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await toMaterials(page);
  await expect(materialItem(page, /Inferencia — capítulos 1 a 4/)).toContainText('Listo', SLOW);
  await page.keyboard.press('Control+k');
  await page
    .getByRole('dialog', { name: 'Buscar' })
    .getByRole('combobox', { name: 'Buscar en tus apuntes y tarjetas' })
    .fill('error estándar');
  await page
    .getByRole('dialog', { name: 'Buscar' })
    .getByRole('option')
    .filter({ hasText: '2.2 El error estándar' })
    .first()
    .click();
  await expect(page.getByText(/^Página 4 de 12$/)).toBeVisible();
  await expect(page.getByRole('heading', { name: '2.2 El error estándar' })).toBeVisible();
});
