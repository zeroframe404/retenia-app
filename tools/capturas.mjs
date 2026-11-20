// «node tools/capturas.mjs <fase>»: abre Retenia (prueba) sin instalar (la carpeta
// release/prueba/win-unpacked que arma «npm run construir»), con una carpeta de datos temporal, y
// saca capturas de las pantallas de esa fase en claro y en oscuro en docs/pruebas-manuales/capturas.
// Sirven para que una persona (y quien revisa) mire cómo se ve antes de aprobar; no se comparan
// con nada (las capturas de referencia que sí se comparan viven en tests/e2e/capturas-de-referencia).
// Fases: fase-03, fase-04 (estas dos describen la pantalla provisoria de tarjetas, que reemplazó la
// Fase 08), fase-05 (esta usa los modelos de voz de desarrollo: «node tools/preparar.mjs --modelos»),
// fase-06, fase-08, fase-09, fase-10, fase-11, fase-12, fase-13 y fase-14.
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
    await page.emulateMedia({
      colorScheme: /** @type {'light' | 'dark'} */ (theme),
      reducedMotion: 'reduce',
    });
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

// Las pantallas nuevas de la Fase 08 con los datos de las pruebas manuales: el editor con los
// renglones que son tarjeta, la lista con su contador y sus filtros, el detalle, la ficha, las dos
// preguntas («¿Cambió lo que hay que recordar?» y la del renglón con historial) y la pausa.
/** @param {import('@playwright/test').Page} page */
async function phase08(page) {
  const saved = page.getByText('Guardado', { exact: true });
  const editor = page.getByRole('textbox', { name: 'Contenido de la nota' });

  // La nota «Regresión lineal» con un renglón de flecha y uno con dos huecos.
  await goToDestination(page, 'Apuntes');
  await page.getByRole('button', { name: 'Nuevo tema' }).click();
  await page.getByRole('textbox', { name: 'Nombre del tema' }).fill('Regresión');
  await page.getByRole('button', { name: 'Crear' }).click();
  await page.getByRole('button', { name: /^Regresión/ }).click();
  await page.getByRole('button', { name: 'Nueva nota' }).click();
  await page.getByRole('textbox', { name: 'Título' }).fill('Regresión lineal');
  await editor.click();
  await page.keyboard.type('Pendiente >> Cuánto cambia y por cada unidad de x');
  await page.keyboard.press('Enter');
  await page.keyboard.type('El agua hierve a 100 °C al nivel del mar');
  // Los huecos se eligen por el editor: el cursor que mueve el teclado llega un instante después.
  /** @param {number} start @param {number} length */
  const choose = (start, length) =>
    page.evaluate(
      ({ from, size }) => {
        const dom = /** @type {any} */ (document.querySelector('.ProseMirror'));
        const origin = dom.editor.state.selection.$from.start();
        dom.editor.commands.setTextSelection({ from: origin + from, to: origin + from + size });
      },
      { from: start, size: length },
    );
  await choose('El agua hierve a '.length, '100 °C'.length);
  await page.keyboard.press('Control+Shift+C');
  await page.waitForFunction(() => document.querySelectorAll('mark[data-cloze]').length === 1);
  await page.keyboard.press('End');
  await page.waitForFunction(
    () => /** @type {any} */ (document.querySelector('.ProseMirror')).editor.state.selection.empty,
  );
  await page.keyboard.press('Enter');
  const line = 'La media de 2, 4 y 6 es 4 y la mediana es 4.';
  await page.keyboard.type(line);
  await choose(line.indexOf('es 4 y') + 3, 1);
  await page.keyboard.press('Control+Shift+C');
  await choose(line.length - 2, 1);
  await page.keyboard.press('Control+Shift+C');
  await page.waitForFunction(() => document.querySelectorAll('mark[data-cloze]').length === 3);
  await saved.waitFor();
  await shoot(page, '1-editor-tarjetas');

  await page.getByRole('button', { name: 'Volver a las notas' }).click();
  await goTo(page, 'Tarjetas');
  await page.getByText('184 tarjetas').waitFor();
  await shoot(page, '2-lista');

  await page.getByLabel('Tema').selectOption({ label: 'Intervalos de confianza' });
  await page.getByText('61 de 184 tarjetas').waitFor();
  await shoot(page, '3-lista-filtrada');
  await page.getByLabel('Tema').selectOption({ label: 'Todos los temas' });

  await page.getByRole('button', { name: 'Abrir la tarjeta «Pendiente»' }).click();
  await page.getByRole('navigation', { name: 'Camino de la tarjeta' }).waitFor();
  await shoot(page, '4-detalle');

  await page.getByRole('button', { name: 'Editar ficha' }).click();
  await page
    .getByRole('textbox', { name: 'Variantes aceptables (una por renglón)' })
    .fill('inclinación de la recta');
  await page.getByRole('textbox', { name: 'Pista 1' }).fill('Empieza con P');
  await shoot(page, '5-ficha');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByText('Cambios guardados').waitFor();

  await page.getByRole('button', { name: 'Crear inversa' }).click();
  await page.getByText('Creé la tarjeta inversa.').waitFor();
  await shoot(page, '6-inversa');
  await page.getByRole('button', { name: 'Pausar esta tarjeta' }).click();
  await page.getByText('En pausa', { exact: true }).waitFor();
  await shoot(page, '7-pausa');
  await page.getByRole('button', { name: 'Volver a las tarjetas' }).click();

  // La tarjeta con historial: cambiar su respuesta pregunta si cambió lo que hay que recordar.
  const media = page.getByRole('button', { name: 'Abrir la tarjeta «¿Qué es la media muestral?»' });
  const scroller = page.locator('section[tabindex="0"]');
  for (let turn = 0; turn < 60 && (await media.count()) === 0; turn += 1) {
    await scroller.evaluate((element) => {
      element.scrollTop += element.clientHeight / 2;
    });
    await page.evaluate(() => new Promise((next) => requestAnimationFrame(next)));
  }
  await media.click();
  await page.getByRole('button', { name: 'Editar ficha' }).click();
  await page
    .getByRole('textbox', { name: 'Respuesta', exact: true })
    .fill('Otra respuesta, de fondo distinta.');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('dialog', { name: '¿Cambió lo que hay que recordar?' }).waitFor();
  await shoot(page, '8-pregunta-cambio');
  await page.getByRole('button', { name: 'Sí' }).click();
  await page.getByText('Todavía sin repasar').waitFor();
  await page.getByRole('button', { name: 'Historial' }).click();
  await page.getByRole('list', { name: 'Repasos de la tarjeta' }).waitFor();
  await shoot(page, '9-historial');

  // Borrar un renglón que es tarjeta con historial.
  await goToDestination(page, 'Apuntes');
  await page
    .getByRole('navigation', { name: 'Secciones de Apuntes' })
    .getByRole('button', { name: 'Notas', exact: true })
    .click();
  await page
    .getByRole('button', { name: /^Intervalos de confianza/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Intervalos de confianza', exact: true }).first().click();
  // Tres clics seguidos eligen el renglón entero; vaciarlo y un Retroceso más lo borran.
  await editor
    .locator('p', { hasText: 'Intervalo de confianza >> Rango de valores plausibles' })
    .first()
    .click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page
    .getByRole('dialog', { name: 'Este renglón tiene una tarjeta con historial. ¿Qué hacemos?' })
    .waitFor();
  await shoot(page, '10-renglon-con-historial');
}

/** @param {import('@playwright/test').Page} page @param {string} question */
async function openCard(page, question) {
  const button = page.getByRole('button', { name: `Abrir la tarjeta «${question}»` });
  const scroller = page.locator('section[tabindex="0"]');
  await page.getByText(/^[\d.]+ tarjetas?$/).waitFor();
  for (let turn = 0; turn < 60 && (await button.count()) === 0; turn += 1) {
    await scroller.evaluate((element) => {
      element.scrollTop += element.clientHeight / 2;
    });
    await page.evaluate(() => new Promise((next) => requestAnimationFrame(next)));
  }
  await button.click();
  await page.getByRole('heading', { level: 3, name: 'Tarjeta' }).waitFor();
}

// Las pantallas de la Fase 09: «¿Por qué hoy?», el repaso con «Deshacer», el repaso anulado, el
// historial con «Anulado» y una tarjeta de una materia en mantenimiento.
/** @param {import('@playwright/test').Page} page */
async function phase09(page) {
  await openCard(page, '¿Qué mide el desvío estándar?');
  await page.getByRole('button', { name: '¿Por qué hoy?' }).click();
  await page.getByText('Estimación general (sin datos tuyos)').waitFor();
  await shoot(page, '1-por-que-hoy');

  await page.getByRole('button', { name: 'Repasar' }).click();
  await page.getByRole('button', { name: '¿Por qué hoy?' }).click();
  await page.getByText(/^La viste hace 23 días/).waitFor();
  await shoot(page, '2-repaso-por-que-hoy');
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: 'Con dudas', exact: true }).click();
  await page.getByRole('button', { name: 'Deshacer' }).waitFor();
  await shoot(page, '3-repaso-con-deshacer');
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await page.getByText(/^Repaso anulado\./).waitFor();
  await shoot(page, '4-repaso-anulado');

  await page.getByRole('button', { name: 'Volver a las tarjetas' }).click();
  await openCard(page, '¿Qué mide el desvío estándar?');
  await page.getByRole('button', { name: 'Historial' }).click();
  await page.getByText(/· Anulado$/).waitFor();
  await shoot(page, '5-historial-anulado');

  // Historia argentina está en mantenimiento: una tarjeta nueva con «La sabía» vuelve el 19/03.
  await goToDestination(page, 'Estudiar');
  await page.getByRole('button', { name: 'Cambiar', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Tus materias' })
    .getByRole('listitem')
    .filter({ hasText: 'Historia argentina' })
    .getByRole('button', { name: 'Abrir' })
    .click();
  await goTo(page, 'Tarjetas');
  await page.getByRole('button', { name: 'Nueva tarjeta' }).click();
  await page
    .getByRole('textbox', { name: 'Pregunta' })
    .fill('¿Quién escribió el Plan de Operaciones?');
  await page.getByRole('textbox', { name: 'Respuesta' }).fill('Mariano Moreno');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByText('Tarjeta guardada').waitFor();
  await itemWith(page, '¿Quién escribió el Plan de Operaciones?')
    .getByRole('button', { name: 'Repasar' })
    .click();
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await page.getByRole('button', { name: 'La sabía', exact: true }).click();
  await page.getByText('Próximo repaso: viernes 19/03/2027').waitFor();
  await shoot(page, '6-mantenimiento');
}

// Las pantallas nuevas de la Fase 10: Estudiar con «Empezar», la sesión (la pregunta con la ayuda
// de teclas y el borrador, la respuesta al lado de lo escrito, el menú «Más», la ficha en el panel),
// Estudiar con «Continuar», el cierre con sus dos cuadros y Progreso › «Dudas y revisiones».
async function phase10(page) {
  await goToDestination(page, 'Estudiar');
  const start = page.getByRole('button', { name: 'Empezar', exact: true });
  await start.and(page.locator(':enabled')).waitFor();
  await shoot(page, '1-estudiar');
  await start.click();
  await page.getByPlaceholder('Tu respuesta…').fill('cuánto se alejan');
  await page.getByText('Borrador guardado').waitFor();
  await shoot(page, '2-sesion-pregunta');
  await page.getByRole('button', { name: 'Más' }).click();
  await shoot(page, '3-sesion-menu-mas');
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  await page.getByRole('dialog', { name: 'Editar la tarjeta' }).waitFor();
  await shoot(page, '4-sesion-editar');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
  await shoot(page, '5-sesion-respuesta');
  await page.getByRole('button', { name: 'No la sabía', exact: true }).click();
  await page.getByText('Calificaste la anterior: No la sabía').waitFor();
  await shoot(page, '6-sesion-calificada');
  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.getByRole('button', { name: 'Continuar: sesión de hoy (1 de 70)' }).waitFor();
  await shoot(page, '7-estudiar-continuar');
  await page.getByRole('button', { name: 'Continuar: sesión de hoy (1 de 70)' }).click();
  for (let step = 0; step < 70; step += 1) {
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await page
      .getByRole('button', { name: step === 1 ? 'Con dudas' : 'La sabía', exact: true })
      .click();
  }
  await page.getByRole('heading', { name: /^Sesión terminada/ }).waitFor();
  await page.getByRole('radio', { name: 'Justo' }).check();
  await shoot(page, '8-cierre');
  await page.getByRole('button', { name: 'Guardar una duda' }).click();
  const dialog = page.getByRole('dialog', { name: 'Guardar una duda' });
  await dialog.getByLabel('Tu duda').fill('No entiendo por qué se divide por n−1');
  await shoot(page, '9-cierre-duda');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: 'Ajustar el plan' }).click();
  await page.getByRole('dialog', { name: 'Ajustar el plan' }).waitFor();
  await shoot(page, '10-cierre-ajustar');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Terminar' }).click();
  await goToDestination(page, 'Progreso');
  await page.getByText('No entiendo por qué se divide por n−1').waitFor();
  await shoot(page, '11-progreso-dudas');
}

/** @param {import('@playwright/test').Page} page */
async function phase11(page) {
  await goToDestination(page, 'Estudiar');
  const start = page.getByRole('button', { name: 'Empezar', exact: true });
  await start.and(page.locator(':enabled')).waitFor();
  const have = (/** @type {number} */ minutes) =>
    page
      .getByRole('group', { name: 'Tengo:' })
      .getByRole('button', { name: String(minutes), exact: true });
  await shoot(page, '1-estudiar-25');
  for (const [minutes, screen, text] of [
    [10, '2-estudiar-10', '45 repasos, sin tarjetas nuevas'],
    [5, '3-estudiar-5', '20 repasos, los más urgentes'],
    [45, '4-estudiar-45', '60 repasos y 18 tarjetas nuevas'],
  ]) {
    await have(Number(minutes)).click();
    await page.getByText(String(text)).waitFor();
    await shoot(page, String(screen));
  }
  await have(25).click();
  await page.getByText('60 repasos y 10 tarjetas nuevas').waitFor();
  await page.getByRole('button', { name: 'Elegir otra actividad' }).click();
  await page.getByRole('button', { name: 'Cerrar' }).waitFor();
  await shoot(page, '5-elegir-otra');
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await page.getByRole('button', { name: 'Posponer' }).click();
  await page.getByRole('button', { name: 'Elegir día' }).waitFor();
  await shoot(page, '6-posponer');
  await page.getByRole('button', { name: 'Mañana' }).click();
  await page.getByText('Listo: vuelve mañana').waitFor();
  await shoot(page, '7-posponer-listo');
  // Después de un tiempo largo sin estudiar: el aviso de atraso, sin números en rojo.
  await goToDestination(page, 'Ajustes');
  await page.getByRole('button', { name: '+35 días' }).click();
  await goToDestination(page, 'Estudiar');
  await page.getByText(/^Hoy no agrego tarjetas nuevas/).waitFor();
  await shoot(page, '8-estudiar-atraso');
  await goToDestination(page, 'Ajustes');
  await page.getByRole('button', { name: 'Restablecer fecha' }).click();
  // Sumar tarjetas nuevas a mano.
  await goTo(page, 'Tarjetas');
  const boxes = page.getByRole('checkbox');
  const scroller = page.locator('section[tabindex="0"]');
  for (let turn = 0; turn < 60 && (await boxes.count()) === 0; turn += 1) {
    await scroller.evaluate((element) => {
      element.scrollTop += element.clientHeight / 2;
    });
    await page.evaluate(() => new Promise((next) => requestAnimationFrame(next)));
  }
  const count = Math.min(10, await boxes.count());
  for (let index = 0; index < count; index += 1) {
    await boxes.nth(index).check();
  }
  await shoot(page, '9-tarjetas-elegidas');
  await page.getByRole('button', { name: 'Sumar a mis repasos' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).waitFor();
  await shoot(page, '10-sumar-costo');
}

/** @param {import('@playwright/test').Page} page */
async function phase12(page) {
  const dialog = page.getByRole('dialog', { name: 'Buscar' });
  const field = dialog.getByRole('combobox', { name: 'Buscar en tus apuntes y tarjetas' });
  const ask = async (/** @type {string} */ text) => {
    await field.fill(text);
    await page.waitForTimeout(250);
  };
  await page.keyboard.press('Control+k');
  await dialog.waitFor();
  await shoot(page, '1-buscar-vacio');
  await ask('desvio');
  await dialog.getByRole('option').first().waitFor();
  await shoot(page, '2-desvio');
  await ask('sqrt(n');
  await dialog.getByRole('option').first().waitFor();
  await shoot(page, '3-formula');
  await ask('tipo:tarjeta mediana');
  await dialog.getByRole('option').first().waitFor();
  await shoot(page, '4-filtro');
  await ask('zzzz');
  await dialog.getByText('No encontré nada con “zzzz”').waitFor();
  await shoot(page, '5-sin-resultados');
  await page.keyboard.press('Escape');
  // Un tema renombrado se sigue encontrando por su nombre viejo.
  await goTo(page, 'Notas');
  await page.getByRole('button', { name: /^Media y dispersión/ }).click();
  await page.getByRole('button', { name: 'Renombrar' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Medidas de resumen');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.keyboard.press('Control+k');
  await dialog.waitFor();
  await ask('Media y dispersión');
  await dialog.getByRole('option').first().waitFor();
  await shoot(page, '6-nombre-viejo');
  await page.keyboard.press('Escape');
  // Durante una sesión: el resultado se abre en un panel a la derecha, sin salir.
  await goToDestination(page, 'Estudiar');
  const start = page.getByRole('button', { name: 'Empezar', exact: true });
  await start.and(page.locator(':enabled')).waitFor();
  await start.click();
  await page.getByPlaceholder('Tu respuesta…').fill('Creo que mide la dispersión');
  await page.keyboard.press('Control+k');
  await dialog.waitFor();
  await ask('tipo:nota intervalos');
  await dialog.getByRole('option').first().waitFor();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog', { name: 'Intervalos de confianza' }).waitFor();
  await page.getByText(/Un intervalo de confianza da un rango/).waitFor();
  await shoot(page, '7-sesion-panel');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Pausar' }).click();
  // Ajustes.
  await goToDestination(page, 'Ajustes');
  await page.getByRole('button', { name: 'Reconstruir índice de búsqueda' }).click();
  await page.getByText(/^Índice reconstruido/).waitFor();
  await shoot(page, '8-ajustes-reconstruir');
  await page.getByRole('button', { name: 'Cargar 10.000 tarjetas' }).click();
  await page.getByText(/^Listo: 10.000 tarjetas/).waitFor({ timeout: 120000 });
  await shoot(page, '9-ajustes-volumen');
  await page.keyboard.press('Control+k');
  await dialog.waitFor();
  await ask('desvio');
  await dialog.getByRole('option').first().waitFor();
  await shoot(page, '10-desvio-con-10000');
}

// Fase 13: Materiales (la lista, agregar, las etapas, el duplicado, el error, el visor, crear una
// tarjeta desde una frase, la tarjeta con su cita, el original en el panel de la sesión, el
// extracto en la Bandeja y «Procesar despacio»).
/** @param {import('@playwright/test').Page} page */
async function phase13(page) {
  const samples = join(ROOT, 'datos-de-ejemplo');
  const inference = 'Inferencia — capítulos 1 a 4';
  const main = page.getByRole('main');
  const row = (/** @type {RegExp} */ title) => main.getByRole('button', { name: title });
  const open = async () => {
    await goToDestination(page, 'Materiales');
    await row(new RegExp(inference)).filter({ hasText: 'Listo' }).waitFor({ timeout: 60_000 });
  };
  await open();
  await shoot(page, '1-lista');
  await page.getByRole('button', { name: 'Agregar material' }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar material' });
  await dialog.getByRole('button', { name: 'Más opciones' }).click();
  await shoot(page, '2-agregar');
  await dialog.getByLabel('Elegir archivo').setInputFiles(join(samples, 'Apunte 3.pdf'));
  const duplicate = page.getByRole('dialog', { name: /^Parece que ya agregaste/ });
  await duplicate.waitFor();
  await shoot(page, '3-duplicado');
  await duplicate.getByRole('button', { name: 'Abrir el existente' }).click();
  // Las etapas a mitad de camino: «Procesar despacio» y una copia del PDF del elenco.
  await goToDestination(page, 'Ajustes');
  await page.getByRole('checkbox', { name: 'Procesar despacio' }).check();
  await shoot(page, '4-procesar-despacio');
  await open();
  await page.getByRole('button', { name: 'Agregar material' }).click();
  await page
    .getByRole('dialog', { name: 'Agregar material' })
    .getByLabel('Elegir archivo')
    .setInputFiles(join(samples, `${inference}.pdf`));
  await page
    .getByRole('dialog', { name: /^Parece que ya agregaste/ })
    .getByRole('button', { name: 'Agregar igual' })
    .click();
  const copy = main.getByRole('button', { name: new RegExp(inference) }).nth(1);
  await copy.filter({ hasText: /Procesando [3-9] de 12/ }).waitFor({ timeout: 60_000 });
  await copy.click();
  await page.getByText(/^Texto extraído \(\d+ de 12 páginas\)$/).waitFor();
  await shoot(page, '5-etapas');
  await goToDestination(page, 'Ajustes');
  await page.getByRole('checkbox', { name: 'Procesar despacio' }).uncheck();
  await open();
  await page.getByRole('button', { name: 'Agregar material' }).click();
  await page
    .getByRole('dialog', { name: 'Agregar material' })
    .getByLabel('Elegir archivo')
    .setInputFiles(join(samples, 'no-es-un-pdf.pdf'));
  await row(/no-es-un-pdf/).click();
  await page.getByText('No pudimos leer este PDF (protegido o dañado)').waitFor();
  await shoot(page, '6-error');
  // El visor: la página 1 con un pasaje citado por una tarjeta, resaltado.
  await row(new RegExp(inference)).first().click();
  await page.getByRole('button', { name: 'Leer el original' }).click();
  await page.locator('[data-cited="true"]').first().click();
  await page.getByRole('button', { name: 'Ver en el original' }).click();
  await page.getByRole('img', { name: 'Pasaje resaltado' }).first().waitFor();
  await shoot(page, '7-visor');
  // Crear una tarjeta desde una oración de la página 2.
  await page.getByRole('button', { name: 'Página siguiente' }).click();
  await page.getByText(/^Página 2 de 12$/).waitFor();
  const sentence =
    'Un parámetro es un número que describe a la población: la media de las alturas de todos los estudiantes, por ejemplo.';
  await page
    .getByText(sentence, { exact: false })
    .first()
    .evaluate((element, text) => {
      const node = /** @type {Text} */ (element.firstChild);
      const start = node.data.indexOf(text);
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }, sentence);
  await page.getByRole('button', { name: 'Crear tarjeta desde acá' }).click();
  const panel = page.getByRole('dialog', { name: 'Crear tarjeta desde acá' });
  await panel
    .getByRole('textbox', { name: 'Pregunta' })
    .fill('¿Qué es un parámetro? Dá un ejemplo.');
  await shoot(page, '8-crear-tarjeta');
  await panel.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: 'Guardar extracto' }).waitFor({ state: 'detached' });
  // Un extracto de la página 2, en la Bandeja.
  await page
    .getByText(sentence, { exact: false })
    .first()
    .evaluate((element, text) => {
      const node = /** @type {Text} */ (element.firstChild);
      const start = node.data.indexOf(text);
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }, sentence);
  await page.getByRole('button', { name: 'Guardar extracto' }).click();
  await page.getByText('Extracto guardado en la Bandeja').waitFor();
  // La Bandeja lleva su contador al lado del nombre: se entra por la fila del riel.
  await page
    .getByRole('navigation', { name: 'Riel lateral' })
    .getByRole('button', { name: /Bandeja/ })
    .click();
  await page.getByText('Inferencia — capítulos 1 a 4 · página 2').waitFor();
  await shoot(page, '9-bandeja-extracto');
  // La tarjeta con su cita.
  // (la lista solo dibuja las que se ven: se la abre con el buscador)
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
  await page.getByRole('button', { name: 'Ver en el original' }).waitFor();
  await shoot(page, '10-tarjeta-con-cita');
  // Durante una sesión: el original en el panel de la derecha.
  await goToDestination(page, 'Estudiar');
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
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
  const side = page.getByRole('dialog', { name: '¿Qué es una muestra?' });
  await side.getByRole('button', { name: 'Ver en el original' }).click();
  await side.getByRole('img', { name: 'Pasaje resaltado' }).first().waitFor();
  await shoot(page, '11-sesion-original');
}

// Fase 14: la Revisión (los tres bloques), la corrección con sus tarjetas, el mapa de cobertura,
// el escaneo reconocido, páginas excluidas y una página web con su instantánea y sin conexión.
/** @param {import('@playwright/test').Page} page */
async function phase14(page) {
  // Una ventana alta, para que las pantallas largas (la revisión) entren enteras en la captura.
  await page.setViewportSize({ width: 1100, height: 1500 });
  const samples = join(ROOT, 'datos-de-ejemplo');
  const main = page.getByRole('main');
  await goToDestination(page, 'Materiales');
  const inference = main.getByRole('button', { name: /Inferencia/ });
  await inference.filter({ hasText: 'Listo' }).waitFor({ timeout: 90_000 });
  await inference.click();
  await page.getByRole('button', { name: 'Revisión' }).click();
  await page.getByRole('heading', { name: 'Con problemas (2)' }).waitFor();
  await shoot(page, '1-revision');
  // Corregir la tabla de la página 7.
  const table = page
    .getByRole('region', { name: /Con problemas/ })
    .getByRole('listitem')
    .first();
  await table.getByRole('button', { name: 'Corregir texto' }).click();
  const field = table.getByRole('textbox', { name: 'Texto corregido' });
  await field.fill((await field.inputValue()).replace('2,228', '2,229'));
  await shoot(page, '2-corregir-texto');
  await table.getByRole('button', { name: 'Guardar corrección' }).click();
  await page.getByText('2 tarjetas usan este texto. ¿Actualizarlas?').waitFor();
  await shoot(page, '3-tarjetas-que-usan-el-texto');
  await page.getByRole('button', { name: 'Ahora no' }).click();
  // El mapa de cobertura.
  await page.getByRole('button', { name: 'Mapa de cobertura' }).click();
  await shoot(page, '4-mapa-de-cobertura');
  // El escaneo de la página 9, reconocido.
  await page.getByRole('button', { name: 'Intentar reconocimiento' }).click();
  await page
    .getByRole('region', { name: 'No extraído' })
    .getByText('Nada por acá.')
    .waitFor({ timeout: 90_000 });
  await shoot(page, '5-pagina-9-reconocida');
  // La página 12, excluida.
  await page.getByRole('button', { name: 'Página 12 Lista' }).click();
  await page.getByRole('button', { name: 'Estudiar sin estas páginas' }).waitFor();
  await shoot(page, '6-visor-con-barra-de-pagina');
  await page.getByRole('button', { name: 'Estudiar sin estas páginas' }).click();
  await page.getByText('Excluida').first().waitFor();
  await shoot(page, '7-pagina-excluida');
  // Una página web desde un archivo, con su instantánea.
  await page.getByRole('button', { name: 'Volver a la revisión' }).click();
  await page.getByRole('button', { name: 'Volver al material' }).click();
  await page.getByRole('button', { name: 'Agregar material' }).click();
  const dialog = page.getByRole('dialog', { name: 'Agregar material' });
  await dialog.getByRole('button', { name: 'Dirección web' }).click();
  await shoot(page, '8-agregar-direccion-web');
  await dialog.getByRole('button', { name: 'Elegir archivo' }).click();
  await dialog.getByLabel('Elegir archivo').setInputFiles(join(samples, 'pagina.html'));
  const web = main.getByRole('button', { name: /teorema central/ });
  await web.filter({ hasText: 'Listo' }).waitFor({ timeout: 60_000 });
  await web.click();
  await shoot(page, '9-pagina-web');
  await page.getByRole('button', { name: 'Leer el original' }).click();
  await page.getByRole('button', { name: 'Instantánea' }).click();
  await page.locator('iframe').waitFor();
  await shoot(page, '10-instantanea');
  // Sin conexión: una dirección queda pendiente.
  await goToDestination(page, 'Ajustes');
  await page.getByRole('checkbox', { name: 'Simular sin conexión' }).check();
  await goToDestination(page, 'Materiales');
  await page.getByRole('button', { name: 'Agregar material' }).click();
  const second = page.getByRole('dialog', { name: 'Agregar material' });
  await second.getByRole('button', { name: 'Dirección web' }).click();
  await second
    .getByRole('textbox', { name: 'Dirección de la página' })
    .fill('https://es.wikipedia.org/wiki/Mediana_(estadística)');
  await second.getByRole('button', { name: 'Agregar' }).click();
  const pending = main.getByRole('button', { name: /wikipedia/ });
  await pending.filter({ hasText: 'Pendiente' }).waitFor({ timeout: 30_000 });
  await pending.click();
  await shoot(page, '11-pendiente-sin-conexion');
}

let { app, page } = await launch(
  {},
  name !== 'fase-06' &&
    name !== 'fase-08' &&
    name !== 'fase-10' &&
    name !== 'fase-11' &&
    name !== 'fase-12' &&
    name !== 'fase-13' &&
    name !== 'fase-14',
);
try {
  if (name === 'fase-14') {
    await phase14(page);
  } else if (name === 'fase-13') {
    await phase13(page);
  } else if (name === 'fase-12') {
    await phase12(page);
  } else if (name === 'fase-11') {
    await phase11(page);
  } else if (name === 'fase-10') {
    await phase10(page);
  } else if (name === 'fase-09') {
    await phase09(page);
  } else if (name === 'fase-08') {
    await phase08(page);
  } else if (name === 'fase-06') {
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
