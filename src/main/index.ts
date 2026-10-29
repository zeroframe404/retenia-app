import { join, resolve } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, nativeTheme, session, shell } from 'electron';
import { systemClock } from '../core/clock';
import { effectiveTheme, PAPER_COLOR, type ThemeChoice } from '../core/theme';
import { zoomStep } from '../core/zoom';
import { openWorkspace } from '../data/workspace';
import { channels, type Registry } from '../preload/contract';
import { demoChannels } from '../preload/contract/demo';
import { labChannels } from '../preload/contract/lab';
import { texts } from '../preload/contract/texts';
import { createAppearanceStore } from './appearance';
import { createHandlers, handleMessage, type Variant } from './bridge';
import { createCloseGuard } from './close-guard';
import { createDemoHandlers, demoExclusiveChannels } from './demo';
import { createDemoDate } from './demo/clock';
import { prepareLabSwitches, startLab } from './demo/lab-setup';
import { createDemoWorkspace } from './demo/switcher';
import { createGate, gateHandlers } from './gate';

const variant: Variant = __VARIANTE__;
const isTest = __VARIANTE__ === 'prueba';
const productName = isTest ? texts.appNameTest : texts.appName;

app.setName(productName);
// El identificador con el que el instalador deja el acceso del menú Inicio: Windows lo usa para
// mostrar los avisos con el nombre del programa y para traerlo al frente al tocarlos.
if (app.isPackaged) {
  app.setAppUserModelId(
    isTest ? 'io.github.zeroframe404.retenia-prueba' : 'io.github.zeroframe404.retenia',
  );
}
if (__VARIANTE__ === 'prueba') {
  prepareLabSwitches();
}

// Los datos viven en la carpeta de datos de aplicaciones de la cuenta de Windows, una por
// variante («Retenia» y «Retenia (prueba)»), nunca dentro de la carpeta del programa. La
// variante de prueba acepta además una carpeta propia (RETENIA_DATOS), para que cada prueba de
// punta a punta y «npm run iniciar» usen la suya. La versión real la ignora.
let dataDir = join(app.getPath('appData'), productName);
if (__VARIANTE__ === 'prueba' && process.env.RETENIA_DATOS) {
  dataDir = resolve(process.env.RETENIA_DATOS);
}
app.setPath('userData', dataDir);

let mainWindow: BrowserWindow | null = null;

// Cerrar la ventana nunca pierde lo escrito (CA-043): se frena el cierre, se le pide a la pantalla
// que guarde lo que tenga a medio escribir y se cierra cuando contesta (`window.flushed`) o, para que
// una ventana colgada no impida cerrar, a los tres segundos.
const FLUSH_TIMEOUT_MS = 3000;
let flushDone: (() => void) | null = null;

function flushWindow(target: BrowserWindow): Promise<void> {
  const contents = target.webContents;
  if (contents.isDestroyed() || contents.isCrashed() || contents.isLoading()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      flushDone = null;
      resolve();
    };
    const timer = setTimeout(finish, FLUSH_TIMEOUT_MS);
    flushDone = finish;
    contents.send('retenia:cierre');
  });
}

// La apariencia elegida también manda sobre el marco de la ventana (la barra de título) y sobre lo
// que el sistema le dice a la página (`prefers-color-scheme`). Devuelve el papel del tema que
// queda, para que la ventana arranque con ese fondo y no con un destello del otro.
function applyFrameTheme(choice: ThemeChoice): string {
  nativeTheme.themeSource = choice === 'system' ? 'system' : choice;
  return PAPER_COLOR[effectiveTheme(choice, nativeTheme.shouldUseDarkColors)];
}

function createWindow(paper: string): void {
  mainWindow = new BrowserWindow({
    title: texts.appName,
    width: 1100,
    height: 720,
    // Los tamaños son los del contenido, sin el marco: así la ventana más angosta que se deja es de
    // 400 píxeles de verdad (docs/especificacion/no-funcionales.md).
    useContentSize: true,
    minWidth: 400,
    minHeight: 360,
    show: false,
    backgroundColor: paper,
    webPreferences: {
      preload: resolve(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isTest,
      spellcheck: false,
    },
  });
  const frame = mainWindow;
  frame.once('ready-to-show', () => frame.show());
  const closeGuard = createCloseGuard(
    () => flushWindow(frame),
    () => {
      if (!frame.isDestroyed()) {
        frame.close();
      }
    },
  );
  frame.on('close', (event) => {
    if (closeGuard.onClose() === 'prevent') {
      event.preventDefault();
    }
  });
  frame.on('closed', () => {
    mainWindow = null;
  });
  frame.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  frame.webContents.on('will-navigate', (event) => event.preventDefault());
  void frame.loadFile(resolve(import.meta.dirname, '../renderer/index.html'));
}

// Una sola instancia (CA-014): si se abre una segunda, la primera pasa al frente.
function bringToFront(): void {
  if (!mainWindow) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function start(): void {
  // En la variante de prueba, la fecha de la demostración (con los días sumados).
  const demo = __VARIANTE__ === 'prueba' ? createDemoDate(dataDir) : null;
  const clock = demo ? demo.clock : systemClock();
  // En la variante de prueba los datos son los del elenco o los de la primera vez (Ajustes ›
  // «Demostración»); el espacio de trabajo que se usa delega en el que corresponda y siembra el
  // elenco al abrirlo.
  const demoData =
    __VARIANTE__ === 'prueba'
      ? createDemoWorkspace({ dataDir, clock, appVersion: app.getVersion() })
      : null;
  const workspace =
    demoData?.workspace ?? openWorkspace({ dataDir, clock, appVersion: app.getVersion() });
  app.on('quit', () => (demoData ? demoData.close() : workspace.close()));

  const paper = applyFrameTheme(createAppearanceStore(dataDir).get());
  let handlers: Record<string, (request: never) => Promise<unknown>> = createHandlers({
    clock,
    variant,
    workspace,
    version: app.getVersion(),
    openFolder: (path) => shell.openPath(path),
    onFlushed: () => flushDone?.(),
    onAppearanceChange: (choice) => mainWindow?.setBackgroundColor(applyFrameTheme(choice)),
    zoom: (direction) => {
      const contents = mainWindow?.webContents;
      if (!contents) {
        return 1;
      }
      const factor = zoomStep(contents.getZoomFactor(), direction);
      contents.setZoomFactor(factor);
      return factor;
    },
  });
  let registry: Registry = channels;
  let exclusive: readonly string[] = [];
  if (__VARIANTE__ === 'prueba' && demo && demoData) {
    const lab = startLab({ dataDir, bringToFront });
    app.on('quit', lab.stop);
    handlers = { ...handlers, ...createDemoHandlers(demo, demoData), ...lab.handlers };
    registry = { ...channels, ...demoChannels(), ...labChannels() };
    exclusive = demoExclusiveChannels;
  }

  // Mientras se restaura una copia o se cambian los datos de la demostración, todo lo demás
  // espera (la base se cierra y se reemplaza).
  const gate = createGate();
  const routes = gateHandlers(handlers, gate, exclusive);

  Menu.setApplicationMenu(null);
  // Todo permiso se niega, salvo el micrófono (solo audio) que pide la ventana de Retenia al
  // tocar «Grabar» en el Laboratorio de la variante de prueba. Si Windows lo tiene bloqueado,
  // Chromium igual no lo consigue y la ventana muestra cómo habilitarlo (CA-027).
  session.defaultSession.setPermissionRequestHandler((contents, permission, decide, details) => {
    const audioOnly =
      permission === 'media' &&
      'mediaTypes' in details &&
      details.mediaTypes?.length === 1 &&
      details.mediaTypes[0] === 'audio';
    decide(__VARIANTE__ === 'prueba' && audioOnly && contents === mainWindow?.webContents);
  });
  const known = registry;
  for (const channel of Object.keys(known)) {
    ipcMain.handle(channel, (_event, request: unknown) =>
      handleMessage(routes, channel, request, known),
    );
  }
  createWindow(paper);

  // Al abrir: la copia automática (si la última tiene 24 horas o más) y, recién después, lo que
  // venció en la Papelera; si la copia falla, lo vencido espera a la próxima vez.
  void gate
    .shared(async () => {
      await workspace.ensureAutomaticBackup();
      workspace.trash.purgeExpired();
    })
    .catch((error: unknown) => {
      // El aviso en castellano y la recuperación llegan en la Fase 39.
      console.error('Retenia no pudo hacer la copia automática al abrir', error);
    });
}

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', bringToFront);
  app
    .whenReady()
    .then(start)
    .catch((error: unknown) => {
      // Sin base no hay programa: se sale en vez de quedar escondida sin ventana y con el candado
      // de la instancia única tomado. El aviso en castellano y la recuperación llegan en la
      // Fase 39.
      console.error('Retenia no pudo abrir su base de datos', error);
      app.exit(1);
    });
  app.on('window-all-closed', () => app.quit());
} else {
  app.quit();
}
