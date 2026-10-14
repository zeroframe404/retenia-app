import { resolve } from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, nativeTheme, session } from 'electron';
import { demoClock, systemClock } from '../core/clock';
import { channels } from '../preload/contract';
import { texts } from '../preload/contract/texts';
import { createHandlers, handleMessage, type Variant } from './bridge';

const variant: Variant = __VARIANTE__;

app.setName(variant === 'prueba' ? texts.appNameTest : texts.appName);

// La variante de prueba acepta una carpeta de datos propia (RETENIA_DATOS), para que cada
// prueba de punta a punta y «npm run iniciar» usen la suya. La versión real la ignora.
const dataDir = process.env.RETENIA_DATOS;
if (variant === 'prueba' && dataDir) {
  app.setPath('userData', resolve(dataDir));
}

const handlers = createHandlers({
  clock: variant === 'prueba' ? demoClock() : systemClock(),
  variant,
});

function createWindow(): void {
  const mainWindow = new BrowserWindow({
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
      devTools: variant === 'prueba',
      spellcheck: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  void mainWindow.loadFile(resolve(import.meta.dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, decide) =>
    decide(false),
  );
  for (const channel of Object.keys(channels)) {
    ipcMain.handle(channel, (_event, request: unknown) =>
      handleMessage(handlers, channel, request),
    );
  }
  createWindow();
});

app.on('window-all-closed', () => app.quit());
