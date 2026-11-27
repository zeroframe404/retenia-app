import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ElectronApplication } from '@playwright/test';
import { texts } from '../../src/preload/contract/texts';
import { expect, test } from './apoyo';

// Un error que nadie atrapó en el proceso principal (docs/decisiones.md, 27/11/2026). Antes, Electron
// abría su aviso «Error», con texto técnico en inglés, y trababa el programa hasta que alguien lo
// aceptara: si pasaba al cerrar, Retenia no terminaba nunca. Ahora el error queda anotado en el
// registro de la carpeta de datos y, con la ventana abierta, Retenia avisa con un texto suyo. Las
// pruebas fuerzan el error desde el proceso principal, como el diagnóstico de ese día.

// Retenia cierra en menos de 3 s (docs/decisiones.md, 27/11/2026): con 20 s de margen, si no terminó
// es que quedó trabada.
const CLOSE_LIMIT_MS = 20_000;

interface LogEntry {
  event: string;
  phase: string;
  error: { message: string };
}

function logEntries(dataDir: string): LogEntry[] {
  const file = join(dataDir, 'registros', 'retenia.log');
  if (!existsSync(file)) {
    return [];
  }
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as LogEntry);
}

function summary(entries: LogEntry[]): string[] {
  return entries.map((entry) => `${entry.event} · ${entry.phase} · ${entry.error.message}`).sort();
}

// Los títulos de las ventanas visibles del proceso, con EnumWindows de Windows: así aparece el aviso
// «Error» de Electron aunque Windows no lo tome como la ventana principal del proceso.
function windowTitles(pid: number): string[] {
  const script = [
    "Add-Type -TypeDefinition @'",
    'using System;',
    'using System.Collections.Generic;',
    'using System.Runtime.InteropServices;',
    'using System.Text;',
    'public static class ReteniaVentanas {',
    '  private delegate bool EnumProc(IntPtr hwnd, IntPtr data);',
    '  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc proc, IntPtr data);',
    '  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);',
    '  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);',
    '  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);',
    '  public static string[] Titles(uint target) {',
    '    var titles = new List<string>();',
    '    EnumWindows((hwnd, data) => {',
    '      uint pid;',
    '      GetWindowThreadProcessId(hwnd, out pid);',
    '      if (pid == target && IsWindowVisible(hwnd)) {',
    '        var text = new StringBuilder(512);',
    '        GetWindowText(hwnd, text, text.Capacity);',
    '        if (text.Length > 0) { titles.Add(text.ToString()); }',
    '      }',
    '      return true;',
    '    }, IntPtr.Zero);',
    '    return titles.ToArray();',
    '  }',
    '}',
    "'@",
    `[ReteniaVentanas]::Titles(${pid}) -join [Environment]::NewLine`,
  ].join('\n');
  try {
    const output = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      { encoding: 'utf8' },
    );
    return output
      .split(/\r?\n/)
      .map((title) => title.trim())
      .filter((title) => title !== '');
  } catch {
    return [];
  }
}

// Si el proceso principal sigue contestando: el aviso «Error» de Electron lo dejaba trabado, sin
// atender a la ventana, hasta que alguien lo aceptara.
async function responds(app: ElectronApplication): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const answered = await Promise.race([
    app.evaluate(() => true).catch(() => false),
    new Promise<boolean>((done) => {
      timer = setTimeout(() => done(false), 2000);
    }),
  ]);
  clearTimeout(timer);
  return answered;
}

// El proceso principal de Retenia. Playwright la abre a través de cmd.exe: `app.process()` es ese
// cmd.exe, que termina cuando termina Retenia, y el aviso «Error» es de una ventana de Retenia.
function mainPidOf(app: ElectronApplication): Promise<number> {
  return app.evaluate(() => process.pid);
}

// Cierra Retenia como quien cierra la ventana y espera a que el proceso termine, con un tope. Si no
// terminó, anota qué ventanas le quedaron y la corta a la fuerza, para no dejarla viva.
async function closeWithin(
  app: ElectronApplication,
  close: () => Promise<void>,
  mainPid: number,
): Promise<{ ended: boolean; windows: string[] }> {
  const child = app.process();
  const pid = child.pid ?? 0;
  const exited = new Promise<boolean>((done) => {
    if (child.exitCode !== null) {
      done(true);
      return;
    }
    child.once('exit', () => done(true));
  });
  void close().catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ended = await Promise.race([
    exited,
    new Promise<boolean>((done) => {
      timer = setTimeout(() => done(false), CLOSE_LIMIT_MS);
    }),
  ]);
  clearTimeout(timer);
  if (ended) {
    return { ended, windows: [] };
  }
  const windows = windowTitles(mainPid);
  execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
  await exited;
  return { ended, windows };
}

test('un error inesperado después de cerrar la carpeta de datos queda anotado y Retenia termina sin el aviso «Error»', async ({
  launchFromStart,
  dataDir,
}) => {
  const { app, page, close } = await launchFromStart();
  await page.getByRole('heading', { level: 2 }).first().waitFor();
  const mainPid = await mainPidOf(app);
  // Como el diagnóstico del 27/11/2026: después de cerrar la carpeta de datos (el evento «quit»), un
  // error que nadie atrapa y una promesa rechazada que nadie espera.
  await app.evaluate(({ app: electronApp }) => {
    electronApp.on('quit', () => {
      setTimeout(() => {
        void Promise.reject(new Error('rechazo forzado después de cerrar'));
        throw new Error('error forzado después de cerrar');
      }, 0);
    });
  });

  const outcome = await closeWithin(app, close, mainPid);

  expect(outcome, 'Retenia no terminó al cerrarla').toEqual({ ended: true, windows: [] });
  // Que estén anotados prueba además que los errores forzados de verdad se tiraron.
  expect(
    summary(logEntries(dataDir)),
    'los dos errores forzados quedan anotados como «cerrándose»',
  ).toEqual([
    'main.uncaught-exception · quitting · error forzado después de cerrar',
    'main.unhandled-rejection · quitting · rechazo forzado después de cerrar',
  ]);
});

test('con la ventana abierta, un error inesperado muestra el aviso de Retenia, sin texto técnico, y queda anotado', async ({
  launchFromStart,
  dataDir,
}) => {
  const { app, page, close } = await launchFromStart();
  await page.getByRole('heading', { level: 2 }).first().waitFor();
  const mainPid = await mainPidOf(app);
  let outcome: { ended: boolean; windows: string[] } = { ended: false, windows: [] };
  try {
    await app.evaluate(() => {
      setTimeout(() => {
        void Promise.reject(new Error('rechazo forzado con la ventana abierta'));
        throw new Error('error forzado con la ventana abierta');
      }, 0);
    });

    await expect
      .poll(() => summary(logEntries(dataDir)))
      .toEqual([
        'main.uncaught-exception · running · error forzado con la ventana abierta',
        'main.unhandled-rejection · running · rechazo forzado con la ventana abierta',
      ]);
    // Después de anotarlo, el proceso principal sigue atendiendo.
    await expect.poll(() => responds(app), { timeout: 10_000 }).toBe(true);
    await expect(
      page.getByRole('status').filter({ hasText: texts.errors.unexpected }),
    ).toBeVisible();
    await expect(page.getByText('forzado')).toHaveCount(0);
  } finally {
    outcome = await closeWithin(app, close, mainPid);
  }
  expect(outcome, 'Retenia no terminó al cerrarla').toEqual({ ended: true, windows: [] });
});
