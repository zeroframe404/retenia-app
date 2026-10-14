// «node tools/capturas.mjs <fase>»: abre Retenia (prueba) sin instalar (la carpeta
// release/prueba/win-unpacked que arma «npm run construir»), con una carpeta de datos temporal, y
// saca capturas de las pantallas de esa fase en claro y en oscuro en docs/pruebas-manuales/capturas.
// Sirven para que una persona (y quien revisa) mire cómo se ve antes de aprobar; no se comparan
// con nada: la red no usa capturas de píxeles. Fases: fase-03 y fase-04.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from '@playwright/test';
import Database from 'better-sqlite3';
import { ROOT } from './lib/proceso.mjs';

const name = process.argv[2] ?? 'fase-03';
const out = join(ROOT, 'docs', 'pruebas-manuales', 'capturas');
mkdirSync(out, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'retenia-capturas-'));

const env = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') {
    env[key] = value;
  }
}
env.RETENIA_DATOS = dataDir;

async function launch() {
  const app = await electron.launch({
    executablePath: join(ROOT, 'release', 'prueba', 'win-unpacked', 'Retenia (prueba).exe'),
    args: [],
    env,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('heading', { level: 2, name: 'Tarjetas' }).waitFor();
  return { app, page };
}

/** @param {import('@playwright/test').Page} page @param {string} screen */
async function shoot(page, screen) {
  for (const [theme, label] of [
    ['light', 'claro'],
    ['dark', 'oscuro'],
  ]) {
    await page.emulateMedia({ colorScheme: /** @type {'light' | 'dark'} */ (theme) });
    await page.screenshot({ path: join(out, `${name}-${screen}-${label}.png`) });
  }
}

/** @param {import('@playwright/test').Page} page @param {string} text */
const itemWith = (page, text) => page.getByRole('listitem').filter({ hasText: text });

/** @param {import('@playwright/test').Page} page @param {string} section */
async function goTo(page, section) {
  await page
    .getByRole('navigation', { name: 'Secciones' })
    .getByRole('button', { name: section })
    .click();
  await page.getByRole('heading', { level: 2, name: section }).waitFor();
}

/** @param {import('@playwright/test').Page} page @param {string} question @param {string} grade */
async function review(page, question, grade) {
  await itemWith(page, question).getByRole('button', { name: 'Repasar' }).click();
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: grade, exact: true }).click();
  await page.getByText(/^Próximo repaso: /).waitFor();
  await page.getByRole('button', { name: 'Volver a las tarjetas' }).click();
}

// Las pantallas de la Fase 03: lista, formulario con aviso y repaso paso a paso.
/** @param {import('@playwright/test').Page} page */
async function phase03(page) {
  await shoot(page, '1-lista');

  await page.getByRole('button', { name: 'Nueva tarjeta' }).click();
  await page.getByRole('textbox', { name: 'Respuesta' }).fill('Roma');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByText('Escribí la pregunta').waitFor();
  await shoot(page, '2-formulario-con-aviso');

  await page.getByRole('textbox', { name: 'Pregunta' }).fill('¿Capital de Francia?');
  await page.getByRole('textbox', { name: 'Respuesta' }).fill('París');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByText('Tarjeta guardada').waitFor();
  await shoot(page, '3-lista-con-cartel');

  await itemWith(page, '¿Capital de Francia?').getByRole('button', { name: 'Repasar' }).click();
  await page.getByRole('button', { name: 'Mostrar respuesta' }).waitFor();
  await shoot(page, '4-repaso-pregunta');

  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: 'La sabía', exact: true }).waitFor();
  await shoot(page, '5-repaso-respuesta');

  await page.getByRole('button', { name: 'La sabía', exact: true }).click();
  await page.getByText('Próximo repaso: miércoles 17/03/2027').waitFor();
  await shoot(page, '6-repaso-resultado');

  await page.getByRole('button', { name: 'Volver a las tarjetas' }).click();
  await page.getByRole('listitem').first().waitFor();
  await shoot(page, '7-lista-con-repaso');
}

// Las pantallas nuevas de la Fase 04, con los datos de las pruebas manuales.
/** @param {import('@playwright/test').Page} page @param {import('@playwright/test').ElectronApplication} app */
async function phase04(page, app) {
  const question = '¿Qué mide el desvío estándar?';
  await shoot(page, '1-tarjetas');

  await review(page, question, 'La sabía');
  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: '+7 días' }).click();
  await page.getByText('DEMOSTRACIÓN · hoy es lunes 22/03/2027').waitFor();
  await shoot(page, '2-demostracion');
  await goTo(page, 'Tarjetas');
  await review(page, question, 'Con dudas');
  await itemWith(page, question).getByRole('button', { name: 'Historial' }).click();
  await page.getByRole('list', { name: 'Repasos de la tarjeta' }).waitFor();
  await shoot(page, '3-historial');
  await page.getByRole('button', { name: 'Volver a las tarjetas' }).click();

  await itemWith(page, '¿Qué es la varianza?').getByRole('button', { name: 'Editar' }).click();
  await page.getByRole('textbox', { name: 'Pregunta' }).fill('¿Qué es la varianza? PRUEBA');
  await shoot(page, '4-editar');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByText('Cambios guardados').waitFor();

  await goTo(page, 'Actividad reciente');
  await page.getByRole('list', { name: 'Tus cambios' }).waitFor();
  await shoot(page, '5-actividad-reciente');

  await goTo(page, 'Ajustes');
  await page.getByRole('button', { name: 'Verificar datos' }).click();
  await page.getByText('Todo en orden · 0 diferencias').waitFor();
  await page.getByRole('button', { name: 'Hacer copia ahora' }).click();
  await page.getByText('Copia hecha y verificada.').waitFor({ timeout: 20_000 });
  await shoot(page, '6-datos-y-copias');

  await goTo(page, 'Tarjetas');
  await itemWith(page, question).getByRole('button', { name: 'Eliminar' }).click();
  await page.getByText('La tarjeta está en la Papelera.').waitFor();
  await goTo(page, 'Papelera');
  await page.getByRole('list', { name: 'Tarjetas en la papelera' }).waitFor();
  await shoot(page, '7-papelera');
  await page.getByRole('button', { name: 'Vaciar papelera' }).click();
  await shoot(page, '8-papelera-confirmacion');
  await page.getByRole('button', { name: 'Vaciar', exact: true }).click();
  await page.getByText('La papelera está vacía.').waitFor();

  await goTo(page, 'Ajustes');
  await page
    .getByRole('list', { name: 'Tus copias' })
    .getByRole('listitem')
    .filter({ hasText: 'Hecha por vos' })
    .getByRole('button', { name: 'Restaurar' })
    .click();
  await page.getByText(/^Listo: volviste a la copia del /).waitFor({ timeout: 20_000 });
  await shoot(page, '9-restaurada');

  // Una agenda tocada a mano con Retenia cerrado, para ver la diferencia y «Reparar».
  await app.close();
  const raw = new Database(join(dataDir, 'retenia.db'));
  raw
    .prepare(
      "UPDATE card_schedule SET due_at = '2027-04-30T13:00:00.000Z' WHERE card_id = (SELECT c.id FROM cards c JOIN card_versions v ON v.id = c.current_version_id WHERE v.question = ?)",
    )
    .run(question);
  raw.close();
  const again = await launch();
  await goTo(again.page, 'Ajustes');
  await again.page.getByRole('button', { name: 'Verificar datos' }).click();
  await again.page.getByText('Hay 1 diferencia').waitFor();
  await shoot(again.page, '10-diferencias');
  return again.app;
}

let { app, page } = await launch();
try {
  if (name === 'fase-04') {
    app = await phase04(page, app);
  } else {
    await phase03(page);
  }
  console.log(`Capturas guardadas en docs/pruebas-manuales/capturas (prefijo ${name}-).`);
} finally {
  await app.close().catch(() => undefined);
  rmSync(dataDir, { recursive: true, force: true });
}
