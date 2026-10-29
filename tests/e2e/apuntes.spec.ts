import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { editor, goTo, itemWith, openNote, openNotes } from './pasos';

// Apuntes (H-09 y H-10, CA-040 a CA-045 y CA-372 a CA-376) de punta a punta, como los usa una
// persona: temas, notas, el editor por renglones, el guardado automático, imágenes, fórmulas y
// enlaces. El elenco trae «Estadística básica» (activa) con sus temas y las notas «Intervalos de
// confianza» y «Media y desvío».

const SAVED = (page: Page) => page.getByText('Guardado', { exact: true });

// Una nota nueva en «Todas las notas»: nace sin tema y abre con el foco en el título.
async function newNote(page: Page, title: string) {
  await openNotes(page);
  await page.getByRole('button', { name: 'Nueva nota' }).click();
  await expect(page.getByRole('textbox', { name: 'Título' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Título' }).fill(title);
}

async function backToNotes(page: Page) {
  await page.getByRole('button', { name: 'Volver a las notas' }).click();
  await expect(page.getByRole('button', { name: 'Nueva nota' })).toBeVisible();
}

// Un PNG de un píxel: lo mínimo que acepta la carpeta de imágenes.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function sendImage(page: Page, kind: 'paste' | 'drop') {
  await page.evaluate(
    ({ base64, kind: how }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], 'captura.png', { type: 'image/png' }));
      const target = document.querySelector('[contenteditable="true"]') as HTMLElement;
      const rect = target.getBoundingClientRect();
      if (how === 'paste') {
        target.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
        );
      } else {
        target.dispatchEvent(
          new DragEvent('drop', {
            dataTransfer: data,
            bubbles: true,
            cancelable: true,
            clientX: rect.left + 20,
            clientY: rect.top + 10,
          }),
        );
      }
    },
    { base64: PNG, kind },
  );
}

test('[CA-040] «Mover a…» pasa una nota de «Sin tema» al tema «Regresión»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openNotes(page);
  await page.getByRole('button', { name: 'Nuevo tema' }).click();
  await page.getByRole('textbox', { name: 'Nombre del tema' }).fill('Regresión');
  await page.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('button', { name: /^Regresión/ })).toBeVisible();

  await newNote(page, 'Regresión lineal');
  await expect(SAVED(page)).toBeVisible();
  await backToNotes(page);

  await page.getByRole('button', { name: /^Sin tema/ }).click();
  const item = itemWith(page, 'Regresión lineal');
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: 'Mover a…' }).click();
  await page
    .getByRole('dialog', { name: 'Mover a…' })
    .getByRole('button', { name: 'Regresión' })
    .click();

  await expect(itemWith(page, 'Regresión lineal')).toHaveCount(0);
  await page.getByRole('button', { name: /^Regresión/ }).click();
  await expect(itemWith(page, 'Regresión lineal')).toBeVisible();
});

test('[CA-040] arrastrar una nota sobre un tema la mueve', async ({ launchFromStart }) => {
  const { page } = await launchFromStart();
  await newNote(page, 'Nota para arrastrar');
  await expect(SAVED(page)).toBeVisible();
  await backToNotes(page);
  await page.getByRole('button', { name: /^Sin tema/ }).click();
  await itemWith(page, 'Nota para arrastrar').dragTo(
    page.getByRole('button', { name: /^Pruebas de hipótesis/ }),
  );
  await expect(itemWith(page, 'Nota para arrastrar')).toHaveCount(0);
  await page.getByRole('button', { name: /^Pruebas de hipótesis/ }).click();
  await expect(itemWith(page, 'Nota para arrastrar')).toBeVisible();
});

test('[CA-042] Tab anida el segundo renglón bajo el primero y Mayús+Tab lo devuelve a su lugar', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await newNote(page, 'Regresión lineal');
  await editor(page).click();
  await page.keyboard.type('Primero');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Segundo');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Tercero');

  const first = page.getByRole('listitem').filter({ hasText: 'Primero' }).first();
  await expect(first.getByRole('listitem')).toHaveCount(0);
  await editor(page).getByText('Segundo').click();
  await page.keyboard.press('Tab');
  await expect(first.getByRole('listitem').filter({ hasText: 'Segundo' })).toHaveCount(1);
  await expect(first.getByRole('listitem').filter({ hasText: 'Tercero' })).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');
  await expect(first.getByRole('listitem')).toHaveCount(0);
  await expect(page.getByRole('listitem')).toHaveCount(3);
});

test('[CA-042] con Tab en el primer renglón el foco sigue su camino: el editor no es una trampa de teclado', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await newNote(page, 'Sin trampa');
  await editor(page).click();
  await page.keyboard.type('Único renglón');
  await page.keyboard.press('Tab');
  await expect(editor(page)).not.toBeFocused();
});

test('[CA-042] los renglones se pliegan y se mueven con el teclado', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await newNote(page, 'Orden');
  await editor(page).click();
  await page.keyboard.type('Uno');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Dos');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Tres');
  await page.keyboard.press('Alt+Shift+ArrowUp');
  await expect(page.getByRole('listitem')).toHaveText(['Uno', 'Tres', 'Dos']);

  await editor(page).getByText('Tres').click();
  await page.keyboard.press('Tab');
  await editor(page).getByText('Uno').click();
  await page.keyboard.press('Control+ArrowUp');
  await expect(editor(page).getByText('Tres')).toBeHidden();
  await page.keyboard.press('Control+ArrowDown');
  await expect(editor(page).getByText('Tres')).toBeVisible();
});

test('[CA-043] a los dos segundos de dejar de escribir dice «Guardado» y al cerrar y abrir Retenia el texto sigue', async ({
  launchFromStart,
  dataDir,
}) => {
  const first = await launchFromStart();
  await newNote(first.page, 'Regresión lineal');
  await editor(first.page).click();
  await first.page.keyboard.type('La recta de mínimos cuadrados');
  await expect(SAVED(first.page)).toBeVisible();
  await first.close();

  const second = await launchFromStart(dataDir);
  await openNotes(second.page);
  await openNote(second.page, 'Regresión lineal');
  await expect(editor(second.page)).toContainText('La recta de mínimos cuadrados');
});

test('[CA-043] cerrar Retenia enseguida, sin esperar el guardado, tampoco pierde lo escrito', async ({
  launchFromStart,
  dataDir,
}) => {
  const first = await launchFromStart();
  await newNote(first.page, 'Cierre rápido');
  await editor(first.page).click();
  await first.page.keyboard.type('Lo último que escribí');
  await first.close();

  const second = await launchFromStart(dataDir);
  await openNotes(second.page);
  await openNote(second.page, 'Cierre rápido');
  await expect(editor(second.page)).toContainText('Lo último que escribí');
});

test('[CA-043] una nota sin título se llama «Sin título» y un texto larguísimo con ñ, tildes y emoji vuelve completo', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openNotes(page);
  await page.getByRole('button', { name: 'Nueva nota' }).click();
  await editor(page).click();
  const chunk = 'Año nuevo, vida nueva: ñandú, camión, pingüino 😀. ';
  const text = `${chunk.repeat(1500)}FIN`;
  await page.keyboard.insertText(text);
  await expect(SAVED(page)).toBeVisible();
  await backToNotes(page);

  const item = itemWith(page, 'Sin título');
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: 'Sin título' }).click();
  await expect(page.getByRole('textbox', { name: 'Título' })).toHaveValue('');
  const stored = await editor(page).innerText();
  expect(stored.replace(/\s+/g, ' ').trim()).toBe(text.replace(/\s+/g, ' ').trim());
});

test('[CA-044] renombrar «Media y dispersión» a «Medidas de resumen» deja el nombre viejo en «Otros nombres»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openNotes(page, 'Media y dispersión');
  await page.getByRole('button', { name: 'Renombrar' }).click();
  const rename = page.getByRole('dialog', { name: 'Renombrar el tema' });
  await rename.getByRole('textbox', { name: 'Nombre del tema' }).fill('Medidas de resumen');
  await rename.getByRole('button', { name: 'Guardar' }).click();
  await expect(rename).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Medidas de resumen/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Media y dispersión/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Detalles' }).click();
  const details = page.getByRole('dialog', { name: 'Detalles de «Medidas de resumen»' });
  await expect(details.getByText('Otros nombres')).toBeVisible();
  await expect(details.getByText('Media y dispersión', { exact: true })).toBeVisible();
});

test('[CA-045] archivar «Media y desvío» la saca de la lista, la muestra en «Archivadas» y «Deshacer» la devuelve', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openNotes(page);
  await expect(itemWith(page, 'Media y desvío')).toBeVisible();
  await itemWith(page, 'Media y desvío').getByRole('button', { name: 'Archivar' }).click();
  await expect(itemWith(page, 'Media y desvío')).toHaveCount(0);
  await expect(page.getByText('Nota archivada.')).toBeVisible();
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(itemWith(page, 'Media y desvío')).toBeVisible();
});

test('[CA-045] una nota archivada aparece en «Archivadas» y ahí se puede desarchivar', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openNotes(page);
  await itemWith(page, 'Media y desvío').getByRole('button', { name: 'Archivar' }).click();
  await page.getByRole('button', { name: /^Archivadas/ }).click();
  const archived = itemWith(page, 'Media y desvío');
  await expect(archived).toBeVisible();
  await archived.getByRole('button', { name: 'Desarchivar' }).click();
  await page.getByRole('button', { name: /^Todas las notas/ }).click();
  await expect(itemWith(page, 'Media y desvío')).toBeVisible();
});

test('[CA-045] archivar un tema y «Deshacer» lo devuelve a la lista de temas', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openNotes(page, 'Pruebas de hipótesis');
  await page.getByRole('button', { name: 'Archivar tema' }).click();
  await expect(page.getByRole('button', { name: /^Pruebas de hipótesis/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Pruebas de hipótesis/ })).toBeVisible();
});

test('eliminar una nota la manda a la Papelera, desde donde se restaura', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openNotes(page);
  await itemWith(page, 'Media y desvío').getByRole('button', { name: 'Eliminar' }).click();
  await expect(itemWith(page, 'Media y desvío')).toHaveCount(0);
  await goTo(page, 'Papelera');
  const trashed = itemWith(page, 'Media y desvío');
  await expect(trashed).toBeVisible();
  await trashed.getByRole('button', { name: 'Restaurar' }).click();
  await goTo(page, 'Notas');
  await expect(itemWith(page, 'Media y desvío')).toBeVisible();
});

test('[CA-372] pegar una imagen la muestra en el renglón, la guarda en la carpeta de datos y sigue ahí al cerrar y abrir', async ({
  launchFromStart,
  dataDir,
}) => {
  const first = await launchFromStart();
  await newNote(first.page, 'Con imagen');
  await editor(first.page).click();
  await first.page.keyboard.type('Mirá esto: ');
  await sendImage(first.page, 'paste');
  const image = first.page.getByRole('img', { name: 'Imagen de la nota' });
  await expect(image).toBeVisible();
  await expect(image).toHaveJSProperty('naturalWidth', 1);
  await expect(SAVED(first.page)).toBeVisible();
  const sha = createHash('sha256').update(Buffer.from(PNG, 'base64')).digest('hex');
  expect(existsSync(join(dataDir, 'imagenes', sha))).toBe(true);
  await first.close();

  const second = await launchFromStart(dataDir);
  await openNotes(second.page);
  await openNote(second.page, 'Con imagen');
  await expect(second.page.getByRole('img', { name: 'Imagen de la nota' })).toHaveJSProperty(
    'naturalWidth',
    1,
  );
});

test('[CA-372] soltar un archivo de imagen en el renglón también la inserta, y la de la nota «Intervalos de confianza» se ve', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await newNote(page, 'Con imagen arrastrada');
  await editor(page).click();
  await sendImage(page, 'drop');
  await expect(page.getByRole('img', { name: 'Imagen de la nota' })).toBeVisible();
  await backToNotes(page);

  await openNote(page, 'Intervalos de confianza');
  await expect(
    page.getByRole('img', { name: 'Curva normal, la campana de Gauss' }),
  ).toHaveJSProperty('complete', true);
});

test('[CA-373] una fórmula entre signos $ se ve como en un libro al salir del renglón y al volver a entrar se ve el texto original', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await newNote(page, 'Fórmulas');
  await editor(page).click();
  const source = String.raw`$\bar{x} \pm t \cdot s/\sqrt{n}$`;
  await page.keyboard.insertText(`Intervalo: ${source}`);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Otro renglón');

  await expect(editor(page).locator('.katex')).toBeVisible();
  await expect(editor(page)).not.toContainText(String.raw`\sqrt{n}`);
  await editor(page).locator('.katex').click();
  await expect(editor(page)).toContainText(source);
  await expect(editor(page).locator('.katex')).toHaveCount(0);
});

test('[CA-373] la fórmula de la nota «Intervalos de confianza» se dibuja y el texto original sigue guardado', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openNotes(page);
  await openNote(page, 'Intervalos de confianza');
  await expect(editor(page).locator('.katex')).toHaveCount(1);
  await expect(editor(page)).toContainText('s / sqrt(n)');
});

test('[CA-374] «[[» y las primeras letras de «Intervalos de confianza» dejan elegir la nota y queda un enlace que la abre con un clic', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await newNote(page, 'Enlaces');
  await editor(page).click();
  await page.keyboard.type('Ver [[Interv');
  const options = page.getByRole('listbox', { name: 'Notas para enlazar' });
  await expect(options.getByRole('option')).toHaveText([
    'Intervalos de confianza · Intervalos de confianza',
  ]);
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(options).toHaveCount(0);

  const link = editor(page).getByRole('link', { name: 'Abrir Intervalos de confianza' });
  await expect(link).toBeVisible();
  await expect(SAVED(page)).toBeVisible();
  await link.click();
  await expect(
    page.getByRole('heading', { level: 3, name: 'Intervalos de confianza' }),
  ).toBeVisible();
});

test('[CA-374] con «[[» y letras que no coinciden con ninguna nota dice que no encontró notas', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await newNote(page, 'Enlaces vacíos');
  await editor(page).click();
  await page.keyboard.type('[[zzzz');
  await expect(page.getByText('No encontré notas con ese nombre.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('No encontré notas con ese nombre.')).toHaveCount(0);
});

test('[CA-375] «Mencionada en» muestra cada renglón que enlaza la nota con el nombre de su nota de origen y un clic lleva a ese renglón', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openNotes(page);
  await openNote(page, 'Intervalos de confianza');
  await page.getByRole('button', { name: 'Mencionada en' }).click();
  const mentions = page.getByRole('list', { name: 'Renglones que la mencionan' });
  await expect(mentions.getByRole('listitem')).toHaveCount(1);
  await expect(mentions).toContainText('Media y desvío');
  await mentions.getByRole('button').first().click();

  await expect(page.getByRole('heading', { level: 3, name: 'Media y desvío' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => getSelection()?.anchorNode?.parentElement?.closest('li')?.textContent ?? '',
      ),
    )
    .toContain('Para ver cómo se usa en un intervalo');
});

test('[CA-376] renombrar una nota enlazada: los enlaces siguen apuntando a ella y muestran el nombre nuevo', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openNotes(page);
  await openNote(page, 'Intervalos de confianza');
  await page.getByRole('textbox', { name: 'Título' }).fill('Estimación por intervalos');
  await expect(SAVED(page)).toBeVisible();
  await backToNotes(page);

  await openNote(page, 'Media y desvío');
  const link = editor(page).getByRole('link', { name: 'Abrir Estimación por intervalos' });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole('textbox', { name: 'Título' })).toHaveValue(
    'Estimación por intervalos',
  );
});
