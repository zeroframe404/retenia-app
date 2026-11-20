import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './apoyo';
import { goTo, goToDestination } from './pasos';

// La revisión de un material, los escaneos y las páginas web (H-27 y H-28) de punta a punta en
// «Retenia (prueba)» empaquetado, como lo usa una persona: por el texto que se ve. «Inferencia —
// capítulos 1 a 4.pdf» ya viene en el elenco y se lee solo al abrir.

const SAMPLES = resolve(import.meta.dirname, '../../datos-de-ejemplo');
const SLOW = { timeout: 90_000 };
const servers: Server[] = [];

test.afterEach(() => {
  for (const server of servers.splice(0)) {
    server.close();
    server.closeAllConnections();
  }
});

const main = (page: Page) => page.getByRole('main');

async function toMaterials(page: Page) {
  await goToDestination(page, 'Materiales');
}

// «Inferencia — capítulos 1 a 4.pdf» → «Revisión», cuando ya terminó de leerse.
async function openReview(page: Page) {
  await toMaterials(page);
  const item = main(page).getByRole('button', { name: /Inferencia/ });
  await expect(item).toContainText('Listo', SLOW);
  await item.click();
  await page.getByRole('button', { name: 'Revisión' }).click();
  await expect(page.getByRole('heading', { name: 'Con problemas (2)' })).toBeVisible(SLOW);
}

async function serve(html: string, contentType = 'text/html; charset=utf-8'): Promise<string> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': contentType }).end(html);
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/pagina`;
}

async function addAddress(page: Page, address: string) {
  await page.getByRole('button', { name: 'Agregar material' }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar material' });
  await dialog.getByRole('button', { name: 'Dirección web' }).click();
  await dialog.getByRole('textbox', { name: 'Dirección de la página' }).fill(address);
  await dialog.getByRole('button', { name: 'Agregar' }).click();
}

test('[CA-113] la Revisión: «Listo», «Con problemas» con la tabla de la página 7 y la fórmula de la 11, y «No extraído» con la 9; cada problema con un botón', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openReview(page);
  const problems = page.getByRole('region', { name: /Con problemas/ });
  await expect(problems.getByText('Página 7')).toBeVisible();
  await expect(problems.getByText('Posible tabla')).toBeVisible();
  await expect(problems.getByText('Página 11')).toBeVisible();
  await expect(problems.getByText('Posible fórmula')).toBeVisible();
  await expect(problems.getByRole('button', { name: 'Corregir texto' })).toHaveCount(2);
  const notExtracted = page.getByRole('region', { name: 'No extraído' });
  await expect(notExtracted.getByText('Página 9')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Listo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leer la sección 1' })).toBeVisible();
});

test('[CA-114] «Intentar reconocimiento» en la página 9: sale de «No extraído» y muestra texto legible', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openReview(page);
  await page.getByRole('button', { name: 'Intentar reconocimiento' }).click();
  await expect(page.getByRole('region', { name: 'No extraído' })).toContainText(
    'Nada por acá.',
    SLOW,
  );
  await page.getByRole('button', { name: 'Mapa de cobertura' }).click();
  await page.getByRole('button', { name: /^Página 9 / }).click();
  await expect(page.getByText(/hipótesis nula/).first()).toBeVisible(SLOW);
});

test('[CA-115] [CA-116] corregir la tabla de la página 7: «2 tarjetas usan este texto. ¿Actualizarlas?», el original no cambia y la corrección sobrevive a reprocesar y a cerrar y abrir', async ({
  launchFromStart,
  dataDir,
}) => {
  const first = await launchFromStart();
  const { page } = first;
  await openReview(page);
  const item = page
    .getByRole('region', { name: /Con problemas/ })
    .getByRole('listitem')
    .first();
  await item.getByRole('button', { name: 'Corregir texto' }).click();
  const field = item.getByRole('textbox', { name: 'Texto corregido' });
  const text = await field.inputValue();
  await field.fill(text.replace('2,228', '2,229'));
  await item.getByRole('button', { name: 'Guardar corrección' }).click();
  await expect(page.getByText('2 tarjetas usan este texto. ¿Actualizarlas?')).toBeVisible();
  // «Ver original»: la página con su número de siempre.
  await item.getByRole('button', { name: 'Ver original' }).click();
  await expect(page.getByText(/^Página 7 de 12$/)).toBeVisible();
  await expect(page.getByText('2,229').first()).toBeVisible();
  // «Reprocesar esta página»: la corrección sigue aplicada.
  await page.getByRole('button', { name: 'Reprocesar esta página' }).click();
  await expect(page.getByText('2,229').first()).toBeVisible(SLOW);
  await first.close();
  const second = await launchFromStart(dataDir);
  await toMaterials(second.page);
  await second.page.getByRole('button', { name: /Inferencia/ }).click();
  await second.page.getByRole('button', { name: 'Leer el original' }).click();
  await second.page
    .getByRole('button', { name: 'Página siguiente' })
    .click({ clickCount: 6, delay: 150 });
  await expect(second.page.getByText(/^Página 7 de 12$/)).toBeVisible();
  await expect(second.page.getByText('2,229').first()).toBeVisible(SLOW);
});

test('[CA-117] [CA-118] el mapa de cobertura: doce casillas con color y palabra, el resumen, y «Estudiar sin estas páginas» deja la 12 «Excluida»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await openReview(page);
  await page.getByRole('button', { name: 'Mapa de cobertura' }).click();
  const map = page.getByRole('list', { name: 'Páginas del material' });
  await expect(map.getByRole('button')).toHaveCount(12);
  await expect(
    page.getByText('9 de 12 páginas listas · 2 para revisar · 1 pendiente'),
  ).toBeVisible();
  await map.getByRole('button', { name: 'Página 12 Lista' }).click();
  await page.getByRole('button', { name: 'Estudiar sin estas páginas' }).click();
  // La página 12 aparece «Excluida» en la barra del visor; se vuelve a la lista y a la revisión.
  await expect(page.getByText('Excluida').first()).toBeVisible();
  await page.getByRole('button', { name: 'Volver a la revisión' }).click();
  await page.getByRole('button', { name: 'Mapa de cobertura' }).click();
  await expect(page.getByRole('button', { name: 'Página 12 Excluida' })).toBeVisible();
});

test('[CA-119] una página web desde «pagina.html»: el texto principal, limpio, con la fecha de guardado', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  await toMaterials(page);
  await page.getByRole('button', { name: 'Agregar material' }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar material' });
  await dialog.getByLabel('Elegir archivo').setInputFiles(join(SAMPLES, 'pagina.html'));
  const item = main(page).getByRole('button', { name: /teorema central/ });
  await expect(item).toContainText('Listo', SLOW);
  await item.click();
  await expect(page.getByText('Instantánea guardada el 15/03/2027')).toBeVisible();
  await page.getByRole('button', { name: 'Leer el original' }).click();
  await expect(page.getByText(/Imaginá que tirás un dado/)).toBeVisible();
  await expect(page.getByText(/Suscribite al boletín/)).toHaveCount(0);
});

test('[CA-119] [CA-120] una dirección web con scripts: la instantánea abre en un marco sin permisos y ningún script corre', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  const address = await serve(readFileSync(join(SAMPLES, 'trampa-script.html'), 'utf8'));
  await toMaterials(page);
  await addAddress(page, address);
  const item = main(page).getByRole('button', { name: /trampas/ });
  await expect(item).toContainText('Listo', SLOW);
  await item.click();
  await page.getByRole('button', { name: 'Leer el original' }).click();
  await page.getByRole('button', { name: 'Instantánea' }).click();
  const frame = page.locator('iframe[title="Instantánea de la página guardada"]');
  await expect(frame).toHaveAttribute('sandbox', '');
  const inside = page.frameLocator('iframe[title="Instantánea de la página guardada"]');
  await expect(inside.getByText('Texto que sí es contenido')).toBeVisible();
  // Ninguno de los scripts de la página corrió.
  await expect(inside.getByText('SCRIPT EJECUTADO')).toHaveCount(0);
  expect(await page.title()).not.toContain('SCRIPT EJECUTADO');
  await expect(inside.locator('script, form, input, img, iframe')).toHaveCount(0);
});

test('[CA-121] «Simular sin conexión»: la página queda «Pendiente: se descarga cuando haya conexión» y, al desactivarlo, se descarga sola y pasa a «Listo»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  const address = await serve(readFileSync(join(SAMPLES, 'pagina.html'), 'utf8'));
  await goTo(page, 'Ajustes');
  const offline = page.getByRole('checkbox', { name: 'Simular sin conexión' });
  await expect(offline).toBeEnabled();
  await offline.check();
  await toMaterials(page);
  await addAddress(page, address);
  const item = main(page).getByRole('button', { name: /127\.0\.0\.1/ });
  await expect(item).toContainText('Pendiente: se descarga cuando haya conexión', SLOW);
  await goTo(page, 'Ajustes');
  await offline.uncheck();
  await toMaterials(page);
  await expect(main(page).getByRole('button', { name: /teorema central/ })).toContainText(
    'Listo',
    SLOW,
  );
});

test('[CA-119] una dirección que redirige (como http a https) se sigue hasta la página y llega a «Listo»', async ({
  launchFromStart,
}) => {
  const { page } = await launchFromStart();
  const target = await serve(readFileSync(join(SAMPLES, 'pagina.html'), 'utf8'));
  const jump = createServer((_request, response) => {
    response.writeHead(302, { location: target }).end();
  });
  servers.push(jump);
  await new Promise<void>((done) => jump.listen(0, '127.0.0.1', done));
  const address = `http://127.0.0.1:${String((jump.address() as AddressInfo).port)}/viejo`;
  await toMaterials(page);
  await addAddress(page, address);
  await expect(main(page).getByRole('button', { name: /teorema central/ })).toContainText(
    'Listo',
    SLOW,
  );
});
