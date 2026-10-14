import { join, resolve } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, nativeTheme, session, shell } from 'electron';
import { systemClock } from '../core/clock';
import { openWorkspace } from '../data/workspace';
import { channels, type Registry } from '../preload/contract';
import { demoChannels } from '../preload/contract/demo';
import { texts } from '../preload/contract/texts';
import { createHandlers, handleMessage, type Variant } from './bridge';
import { createDemoHandlers } from './demo';
import { createDemoDate } from './demo/clock';
import { seedDemoCards } from './demo/seed';
import { createGate, gateHandlers } from './gate';

const variant: Variant = __VARIANTE__;
const isTest = __VARIANTE__ === 'prueba';
const productName = isTest ? texts.appNameTest : texts.appName;

app.setName(productName);

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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: texts.appName,
    width: 1100,
    height: 720,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16171a' : '#f7f6f2',
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
  const window = mainWindow;
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    mainWindow = null;
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  void window.loadFile(resolve(import.meta.dirname, '../renderer/index.html'));
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
  const workspace = openWorkspace({ dataDir, clock, appVersion: app.getVersion() });
  app.on('quit', () => workspace.close());
  if (__VARIANTE__ === 'prueba') {
    seedDemoCards(workspace.cards);
  }

  let handlers: Record<string, (request: never) => Promise<unknown>> = createHandlers({
    clock,
    variant,
    workspace,
    version: app.getVersion(),
    openFolder: (path) => shell.openPath(path),
  });
  let registry: Registry = channels;
  if (__VARIANTE__ === 'prueba' && demo) {
    handlers = { ...handlers, ...createDemoHandlers(demo) };
    registry = { ...channels, ...demoChannels() };
  }

  // Mientras se restaura una copia, todo lo demás espera (la base se cierra y se reemplaza).
  const gate = createGate();
  const routes = gateHandlers(handlers, gate);

  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, decide) =>
    decide(false),
  );
  const known = registry;
  for (const channel of Object.keys(known)) {
    ipcMain.handle(channel, (_event, request: unknown) =>
      handleMessage(routes, channel, request, known),
    );
  }
  createWindow();

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
