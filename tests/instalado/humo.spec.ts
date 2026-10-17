import { spawn } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { test as base, _electron as electron, expect } from '@playwright/test';
import { DEV_MODELS_DIR } from '../../tools/lib/modelos.mjs';
import { ROOT } from '../../tools/lib/proceso.mjs';
import { serveModels } from '../apoyo/servidor-de-modelos';

// Humo del instalador (capa N): instala «Retenia (prueba)» en silencio como lo haría una persona
// en una Windows limpia, la abre, crea una tarjeta, la cierra, la abre de nuevo, la abre por
// segunda vez y la desinstala. Corre en el CI con el instalador que arma ese mismo trabajo.
// En una PC con Retenia (prueba) ya usada se niega a correr: mezclaría sus datos.
//
//   RETENIA_INSTALADOR   el instalador a probar (obligatorio)
//   RETENIA_INSTALAR_EN  carpeta de instalación (opcional; por defecto la de Windows)

const PRODUCT = 'Retenia (prueba)';
const installer = process.env.RETENIA_INSTALADOR ? resolve(process.env.RETENIA_INSTALADOR) : '';
const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
const installDir = process.env.RETENIA_INSTALAR_EN
  ? resolve(process.env.RETENIA_INSTALAR_EN)
  : join(localAppData, 'Programs', PRODUCT);
const installedExe = join(installDir, `${PRODUCT}.exe`);
const uninstaller = join(installDir, `Uninstall ${PRODUCT}.exe`);
const shortcut = join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${PRODUCT}.lnk`);
const dataFolder = join(appData, PRODUCT);
const realDataFolder = join(appData, 'Retenia');

// Las variables de entorno de esta PC, sin la carpeta de datos propia de las pruebas: el
// programa instalado tiene que usar la carpeta que le corresponde en Windows.
function installedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE' && key !== 'RETENIA_DATOS') {
      env[key] = value;
    }
  }
  return env;
}

function runToEnd(command: string, args: string[], timeoutMs: number) {
  return new Promise<{ exitCode: number | null; ended: boolean }>((done) => {
    const child = spawn(command, args, { env: installedEnv(), stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill();
      done({ exitCode: null, ended: false });
    }, timeoutMs);
    child.once('exit', (exitCode) => {
      clearTimeout(timer);
      done({ exitCode, ended: true });
    });
  });
}

// «ready» queda en verdadero recién cuando se comprobó que la PC está limpia: si el humo se niega
// a correr, no toca nada de lo que ya había (ni siquiera al limpiar al final).
const state = {
  ready: false,
  dataExistedBefore: false,
  realDataExistedBefore: false,
  installed: false,
};

const test = base;
test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  if (!installer || !existsSync(installer)) {
    throw new Error(
      'Falta el instalador: indicá su ruta en RETENIA_INSTALADOR (lo arma «npm run construir -- --instalador»).',
    );
  }
  state.dataExistedBefore = existsSync(dataFolder);
  state.realDataExistedBefore = existsSync(realDataFolder);
  if (state.dataExistedBefore || existsSync(installedExe)) {
    throw new Error(
      `Ya hay una instalación o datos de ${PRODUCT} en esta PC (${relative(homedir(), dataFolder)}). El humo del instalador se corre en una Windows limpia, como la del CI.`,
    );
  }
  state.ready = true;
});

test.afterAll(async () => {
  // Pase lo que pase, la PC queda como estaba: se desinstala y se borran los datos que creó el humo.
  // Pero solo si el humo llegó a empezar: Playwright corre esto aunque el beforeAll se haya negado.
  if (!state.ready) {
    return;
  }
  if (existsSync(uninstaller)) {
    await runToEnd(uninstaller, ['/S'], 60_000);
  }
  if (!state.dataExistedBefore) {
    rmSync(dataFolder, { recursive: true, force: true });
  }
});

// Espera a que se cumpla algo, mirando cada cuarto de segundo (sin leer la hora del sistema).
async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  for (let waited = 0; waited < timeoutMs; waited += 250) {
    if (condition()) {
      return true;
    }
    await new Promise((wake) => setTimeout(wake, 250));
  }
  return condition();
}

function launchInstalled() {
  return electron.launch({ executablePath: installedExe, args: [], env: installedEnv() });
}

test('[CA-012] el instalador de «Retenia (prueba)» se instala en silencio y deja su acceso en el menú Inicio', async () => {
  const outcome = await runToEnd(installer, ['/S', `/D=${installDir}`], 240_000);
  expect(outcome).toEqual({ exitCode: 0, ended: true });
  state.installed = true;
  expect(existsSync(installedExe), 'el ejecutable instalado').toBe(true);
  expect(existsSync(join(installDir, 'resources', 'app.asar')), 'el paquete de la aplicación').toBe(
    true,
  );
  expect(existsSync(uninstaller), 'el desinstalador').toBe(true);
  expect(existsSync(shortcut), `el acceso del menú Inicio (${relative(appData, shortcut)})`).toBe(
    true,
  );
});

test('[CA-012] el programa instalado abre con el título «Retenia», la cinta de demostración y las tres tarjetas de ejemplo, y guarda sus datos en la carpeta de «Retenia (prueba)»', async () => {
  const app = await launchInstalled();
  try {
    const page = await app.firstWindow();
    await expect(page).toHaveTitle('Retenia');
    expect(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle()),
    ).toBe('Retenia');
    await expect(
      page.getByText('DEMOSTRACIÓN · hoy es lunes 15/03/2027', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(3);
    await expect(page.getByRole('listitem').first()).toContainText('¿Qué mide el desvío estándar?');

    // Los datos: en la carpeta de datos de aplicaciones de la cuenta, aparte de «Retenia» y
    // fuera de la carpeta del programa.
    const info = await page.evaluate(() => window.retenia['app.info']({}));
    expect(info.variant).toBe('prueba');
    expect(resolve(info.dataDir)).toBe(resolve(dataFolder));
    expect(resolve(info.dataDir).startsWith(resolve(installDir))).toBe(false);
    expect(existsSync(join(dataFolder, 'retenia.db'))).toBe(true);
    expect(existsSync(realDataFolder) === state.realDataExistedBefore).toBe(true);
    expect(readdirSync(installDir).some((name) => name.endsWith('.db'))).toBe(false);
  } finally {
    await app.close();
  }
});

test('[CA-009] una tarjeta creada en el programa instalado sigue ahí después de cerrar y abrir', async () => {
  const first = await launchInstalled();
  try {
    const page = await first.firstWindow();
    await page.getByRole('button', { name: 'Nueva tarjeta' }).click();
    await page.getByRole('textbox', { name: 'Pregunta' }).fill('¿Capital de Francia?');
    await page.getByRole('textbox', { name: 'Respuesta' }).fill('París');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Tarjeta guardada')).toBeVisible();
    await expect(page.getByRole('listitem').first()).toContainText('¿Capital de Francia?');
  } finally {
    await first.close();
  }
  const second = await launchInstalled();
  try {
    const page = await second.firstWindow();
    await expect(page.getByRole('listitem')).toHaveCount(4);
    await expect(page.getByRole('listitem').first()).toContainText('¿Capital de Francia?');
  } finally {
    await second.close();
  }
});

test('[CA-014] abrir el programa instalado por segunda vez pasa al frente la ventana que ya estaba y no abre otra', async () => {
  const app = await launchInstalled();
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', { level: 2, name: 'Tarjetas' })).toBeVisible();
    const windowState = () =>
      app.evaluate(({ BrowserWindow }) => {
        const [first] = BrowserWindow.getAllWindows();
        return { count: BrowserWindow.getAllWindows().length, minimized: first?.isMinimized() };
      });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.minimize());
    await expect.poll(windowState).toEqual({ count: 1, minimized: true });

    expect(await runToEnd(installedExe, [], 30_000)).toEqual({ exitCode: 0, ended: true });
    await expect.poll(windowState).toEqual({ count: 1, minimized: false });
  } finally {
    await app.close();
  }
});

// El Laboratorio (H-07) dentro del programa instalado: las cinco piezas con los procesos de
// trabajo del paquete instalado (sherpa-onnx fuera del asar, tesseract.js con sus idiomas
// adentro). En el CI no hay micrófono ni parlantes: la descarga viene de un servidor local que
// sirve los modelos de desarrollo con las direcciones de la página real, el micrófono es el de
// prueba de Chromium con el audio de ejemplo «good morning», y la voz se comprueba por el audio
// que arma (su duración), no escuchándolo.
test('[CA-024] [CA-025] [CA-026] [CA-028] [CA-029] [CA-030] el Laboratorio anda en el programa instalado: baja los modelos, habla, transcribe el audio de ejemplo, lee el PDF y el escaneo y manda el aviso', async () => {
  const server = await serveModels(DEV_MODELS_DIR);
  const app = await electron.launch({
    executablePath: installedExe,
    args: [],
    env: {
      ...installedEnv(),
      RETENIA_MODELOS_ORIGEN: server.origin,
      RETENIA_MICROFONO_ARCHIVO: join(ROOT, 'datos-de-ejemplo', 'good-morning.wav'),
    },
  });
  try {
    const page = await app.firstWindow();
    await page
      .getByRole('navigation', { name: 'Secciones' })
      .getByRole('button', { name: 'Ajustes' })
      .click();
    await page.getByRole('button', { name: 'Laboratorio' }).click();
    const region = (name: string) => page.getByRole('region', { name });
    const elapsed = /^Tardó \d+,\d s$/;

    const voice = region('Voz');
    await voice.getByRole('button', { name: 'Descargar modelos' }).click();
    await expect(voice.getByRole('progressbar', { name: 'Descarga de los modelos' })).toBeVisible();
    await expect(voice.getByText('Modelos listos')).toBeVisible({ timeout: 240_000 });
    await voice.getByRole('textbox', { name: 'Frase en inglés' }).fill('The weather is nice today');
    await voice.getByRole('button', { name: 'Decir en voz alta' }).click();
    await expect(voice.getByText(elapsed)).toBeVisible({ timeout: 120_000 });
    await expect
      .poll(() => voice.locator('audio').evaluate((a: HTMLAudioElement) => a.duration))
      .toBeGreaterThan(1);

    const transcription = region('Transcripción');
    await transcription.getByRole('button', { name: 'Grabar' }).click();
    await expect(transcription.getByText(/^Grabando… 2 s\./)).toBeVisible({ timeout: 30_000 });
    await transcription.getByRole('button', { name: 'Detener' }).click();
    await expect(transcription.getByText('Entendí: “good morning”')).toBeVisible({
      timeout: 120_000,
    });

    const pdf = region('PDF');
    await pdf.getByRole('button', { name: 'Leer PDF de prueba' }).click();
    await expect(pdf.getByText(/Capítulo 1 · Población, muestra y estimadores/)).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      pdf.getByRole('img', { name: 'Página 1 con la frase resaltada' }).getByRole('mark'),
    ).toHaveCount(2);

    const scan = region('Escaneo');
    await scan.getByRole('button', { name: 'Leer página escaneada' }).click();
    await expect(scan.getByText(/La hipótesis nula y la alternativa/)).toBeVisible({
      timeout: 180_000,
    });

    const notice = region('Aviso');
    await notice.getByRole('button', { name: 'Probar aviso' }).click();
    await expect(
      notice.getByText('Aviso enviado. Minimizá Retenia y tocalo: Retenia vuelve al frente.'),
    ).toBeVisible({ timeout: 30_000 });
  } finally {
    await app.close();
    await server.close();
  }
});

test('[CA-012] desinstalar en silencio saca el programa y su acceso del menú Inicio, y deja los datos', async () => {
  const outcome = await runToEnd(uninstaller, ['/S'], 120_000);
  expect(outcome.ended).toBe(true);
  // El desinstalador se copia a una carpeta temporal y termina antes de borrar: se espera.
  const gone = await waitUntil(() => !existsSync(installedExe) && !existsSync(shortcut), 90_000);
  expect(gone, 'el programa y el acceso del menú Inicio siguen ahí').toBe(true);
  expect(existsSync(join(dataFolder, 'retenia.db')), 'los datos no se tocan al desinstalar').toBe(
    true,
  );
});
