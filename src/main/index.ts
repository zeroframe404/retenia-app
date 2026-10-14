import { join, resolve } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, nativeTheme, session } from 'electron';
import { demoClock, systemClock } from '../core/clock';
import { createCardsStore } from '../data/cards';
import { openDatabase } from '../data/database';
import { channels, type Registry } from '../preload/contract';
import { demoChannels } from '../preload/contract/demo';
import { texts } from '../preload/contract/texts';
import { createHandlers, handleMessage, type Variant } from './bridge';
import { createDemoHandlers } from './demo';
import { seedDemoCards } from './demo/seed';

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
  const clock = isTest ? demoClock() : systemClock();
  const db = openDatabase(join(dataDir, 'retenia.db'), { clock });
  app.on('quit', () => db.close());
  const cards = createCardsStore(db, clock);
  if (__VARIANTE__ === 'prueba') {
    seedDemoCards(cards);
  }

  let handlers: Record<string, (request: never) => Promise<unknown>> = createHandlers({
    clock,
    variant,
    cards,
    dataDir,
    version: app.getVersion(),
  });
  let registry: Registry = channels;
  if (__VARIANTE__ === 'prueba') {
    handlers = { ...handlers, ...createDemoHandlers({ clock }) };
    registry = { ...channels, ...demoChannels() };
  }

  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, decide) =>
    decide(false),
  );
  const known = registry;
  const routes = handlers;
  for (const channel of Object.keys(known)) {
    ipcMain.handle(channel, (_event, request: unknown) =>
      handleMessage(routes, channel, request, known),
    );
  }
  createWindow();
}

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', bringToFront);
  app.whenReady().then(start);
  app.on('window-all-closed', () => app.quit());
} else {
  app.quit();
}
