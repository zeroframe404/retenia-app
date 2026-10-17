// «node tools/capturas.mjs <fase>»: abre Retenia (prueba) sin instalar (la carpeta
// release/prueba/win-unpacked que arma «npm run construir»), con una carpeta de datos temporal, y
// saca capturas de las pantallas de esa fase en claro y en oscuro en docs/pruebas-manuales/capturas.
// Sirven para que una persona (y quien revisa) mire cómo se ve antes de aprobar; no se comparan
// con nada (las capturas de referencia que sí se comparan viven en tests/e2e/capturas-de-referencia).
// Fases: fase-03, fase-04, fase-05 (esta usa los modelos de voz de desarrollo: «node tools/preparar.mjs
// --modelos») y fase-06.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from '@playwright/test';
import Database from 'better-sqlite3';
import { DEV_MODELS_DIR } from './lib/modelos.mjs';
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

/**
 * @param {Record<string, string>} [extra] variables de la variante de prueba (Laboratorio)
 * @param {boolean} [toCards] deja a la vista Apuntes › «Tarjetas»; sin eso, la pantalla inicial
 */
async function launch(extra = {}, toCards = true) {
  const app = await electron.launch({
    executablePath: join(ROOT, 'release', 'prueba', 'win-unpacked', 'Retenia (prueba).exe'),
    args: [],
    env: { ...env, ...extra },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('heading', { level: 2, name: 'Estudiar' }).waitFor();
  if (toCards) {
    await goTo(page, 'Tarjetas');
  }
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

/** @param {import('@playwright/test').Page} page @param {string} destination */
async function goToDestination(page, destination) {
  await page
    .getByRole('navigation', { name: 'Riel lateral' })
    .getByRole('button', { name: destination, exact: true })
    .click();
  await page.getByRole('heading', { level: 2, name: destination }).waitFor();
}

// «Tarjetas», «Papelera» y «Actividad reciente» viven adentro de Apuntes; «Ajustes» es del riel.
/** @param {import('@playwright/test').Page} page @param {string} section */
async function goTo(page, section) {
  if (section === 'Ajustes') {
    await goToDestination(page, 'Ajustes');
    return;
  }
  await goToDestination(page, 'Apuntes');
  await page
    .getByRole('navigation', { name: 'Secciones de Apuntes' })
    .getByRole('button', { name: section, exact: true })
    .click();
  await page.getByRole('heading', { level: 3, name: section }).waitFor();
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

// Las pantallas de la Fase 05: Ajustes con «Demostración» y el Laboratorio, sin modelos, con cada
// resultado (modelos de desarrollo y micrófono de prueba) y con el micrófono bloqueado.
/** @param {{ app: import('@playwright/test').ElectronApplication, page: import('@playwright/test').Page }} first */
async function phase05(first) {
  /** @param {import('@playwright/test').Page} page */
  const openLab = async (page) => {
    await goTo(page, 'Ajustes');
    await page.getByRole('button', { name: 'Laboratorio' }).click();
    await page.getByRole('heading', { level: 2, name: 'Laboratorio' }).waitFor();
  };
  /** @param {import('@playwright/test').Page} page @param {string} region */
  const showRegion = (page, region) =>
    page
      .getByRole('region', { name: region })
      .evaluate((element) => element.scrollIntoView({ block: 'start' }));

  await goTo(first.page, 'Ajustes');
  await first.page
    .getByRole('heading', { name: 'Demostración' })
    .evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await shoot(first.page, '1-ajustes-demostracion');
  await first.page.getByRole('button', { name: 'Laboratorio' }).click();
  await first.page
    .getByText(
      'Para usar la voz hay que descargar los modelos una vez. Conectate y tocá Descargar.',
    )
    .waitFor();
  await shoot(first.page, '2-laboratorio-sin-modelos');
  await first.app.close();

  const second = await launch({
    RETENIA_MODELOS: DEV_MODELS_DIR,
    RETENIA_MICROFONO_ARCHIVO: join(ROOT, 'datos-de-ejemplo', 'good-morning.wav'),
  });
  const page = second.page;
  await openLab(page);
  const voice = page.getByRole('region', { name: 'Voz' });
  await voice.getByText('Modelos listos').waitFor();
  await voice.getByRole('textbox', { name: 'Frase en inglés' }).fill('The weather is nice today');
  await voice.getByRole('radio', { name: 'Hombre, Reino Unido' }).check();
  await voice.getByRole('button', { name: 'Decir en voz alta' }).click();
  await voice.getByText(/^Tardó /).waitFor({ timeout: 60_000 });
  await showRegion(page, 'Voz');
  await shoot(page, '3-voz');

  const transcription = page.getByRole('region', { name: 'Transcripción' });
  await transcription.getByRole('button', { name: 'Grabar' }).click();
  await transcription.getByText(/^Grabando… 2 s\./).waitFor({ timeout: 20_000 });
  await showRegion(page, 'Transcripción');
  await shoot(page, '4-grabando');
  await transcription.getByRole('button', { name: 'Detener' }).click();
  await transcription.getByText(/^Entendí: /).waitFor({ timeout: 60_000 });
  await showRegion(page, 'Transcripción');
  await shoot(page, '5-transcripcion');

  const pdf = page.getByRole('region', { name: 'PDF' });
  await pdf.getByRole('button', { name: 'Leer PDF de prueba' }).click();
  await pdf.getByRole('img', { name: 'Frase resaltada' }).first().waitFor({ timeout: 30_000 });
  await pdf
    .getByRole('figure', { name: 'Página 1 con la frase resaltada' })
    .evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await shoot(page, '6-pdf');

  const scan = page.getByRole('region', { name: 'Escaneo' });
  await scan.getByRole('button', { name: 'Leer página escaneada' }).click();
  await scan.getByText(/La hipótesis nula y la alternativa/).waitFor({ timeout: 120_000 });
  await showRegion(page, 'Escaneo');
  await shoot(page, '7-escaneo');

  const notice = page.getByRole('region', { name: 'Aviso' });
  await notice.getByRole('button', { name: 'Probar aviso' }).click();
  await notice.getByText(/^Aviso enviado/).waitFor({ timeout: 20_000 });
  await showRegion(page, 'Aviso');
  await shoot(page, '8-aviso');
  await second.app.close();

  const third = await launch({
    RETENIA_MODELOS: DEV_MODELS_DIR,
    RETENIA_SIMULAR_MICROFONO: 'bloqueado',
  });
  await openLab(third.page);
  const blocked = third.page.getByRole('region', { name: 'Transcripción' });
  await blocked.getByRole('button', { name: 'Grabar' }).click();
  await blocked.getByRole('link', { name: 'Cómo habilitarlo' }).click();
  await blocked.getByText('Volvé a Retenia y tocá «Grabar».').waitFor();
  await showRegion(third.page, 'Transcripción');
  await shoot(third.page, '9-microfono-bloqueado');
  return third.app;
}

// Las pantallas nuevas de la Fase 06: el riel con sus seis destinos, Apuntes, Ajustes con
// «Apariencia», el cuadro «Buscar», la «Galería» y, al final, todo en oscuro elegido a mano.
/** @param {import('@playwright/test').Page} page */
async function phase06(page) {
  await page.mouse.move(560, 4);
  await shoot(page, '1-estudiar');
  await goToDestination(page, 'Apuntes');
  await page.getByRole('listitem').first().waitFor();
  await shoot(page, '2-apuntes');
  await goToDestination(page, 'Materiales');
  await shoot(page, '3-materiales');
  await goToDestination(page, 'Idiomas');
  await shoot(page, '4-idiomas');
  await goToDestination(page, 'Progreso');
  await shoot(page, '5-progreso');
  await goToDestination(page, 'Ajustes');
  await shoot(page, '6-ajustes');
  await page.keyboard.press('Control+K');
  await page.getByRole('dialog', { name: 'Buscar' }).waitFor();
  await shoot(page, '7-buscar');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Galería' }).click();
  await page.getByRole('heading', { level: 2, name: 'Galería' }).waitFor();
  const main = page.getByRole('main');
  const { height, total } = await main.evaluate((element) => ({
    height: element.clientHeight,
    total: element.scrollHeight,
  }));
  const slices = Math.ceil(total / height);
  // En la guía de pruebas, el principio de la galería y sus seis estados (al final); las demás
  // partes están en las capturas de referencia (tests/e2e/capturas-de-referencia).
  for (const slice of [0, slices - 1]) {
    await main.evaluate((element, top) => element.scrollTo(0, top), slice * height);
    await page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
    await shoot(page, slice === 0 ? '8-galeria-principio' : '8-galeria-estados');
  }

  // El tema oscuro elegido en «Apariencia» (no el del sistema): se aplica en el acto.
  await page.getByRole('button', { name: 'Volver a Ajustes' }).click();
  await page.getByRole('radio', { name: 'Oscuro' }).check();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: join(out, `${name}-9-oscuro-elegido.png`) });
  await page.getByRole('radio', { name: 'Según el sistema' }).check();
}

let { app, page } = await launch({}, name !== 'fase-06');
try {
  if (name === 'fase-06') {
    await phase06(page);
  } else if (name === 'fase-05') {
    app = await phase05({ app, page });
  } else if (name === 'fase-04') {
    app = await phase04(page, app);
  } else {
    await phase03(page);
  }
  console.log(`Capturas guardadas en docs/pruebas-manuales/capturas (prefijo ${name}-).`);
} finally {
  await app.close().catch(() => undefined);
  rmSync(dataDir, { recursive: true, force: true });
}
