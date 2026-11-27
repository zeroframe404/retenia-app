import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Clock, Stopwatch } from '../core/clock';
import {
  type AppPhase,
  LOG_FILE_NAME,
  logLine,
  needsRotation,
  rotationRenames,
  shouldShowNotice,
  type UnexpectedOrigin,
  unexpectedErrorEntry,
} from '../core/unexpected-errors';

// Los errores que nadie atrapó en el proceso principal (docs/decisiones.md, 27/11/2026). Sin esto,
// Electron abre su aviso «Error», en inglés y con la pila, y traba el programa hasta que alguien lo
// acepta: si pasa al cerrar, Retenia no termina. Con un manejador propio ese aviso ya no sale para
// ningún error, así que cada uno queda anotado en el registro de la carpeta de datos y, con la
// ventana abierta, Retenia avisa con un texto suyo. Cerrándose, solo se anota y el cierre sigue.

export interface ErrorLog {
  // Anota el error en registros/retenia.log, al instante. Nunca tira: si el disco no deja escribir,
  // devuelve false.
  record(input: { error: unknown; origin: UnexpectedOrigin; phase: AppPhase }): boolean;
}

function sizeOf(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

function rotateIfFull(folder: string, incomingBytes: number): void {
  if (!needsRotation(sizeOf(join(folder, LOG_FILE_NAME)), incomingBytes)) {
    return;
  }
  for (const { from, to } of rotationRenames()) {
    try {
      renameSync(join(folder, from), join(folder, to));
    } catch {
      // Ese anterior todavía no existe (o Windows lo tiene tomado): se sigue con el resto.
    }
  }
}

export function createErrorLog({
  dataDir,
  version,
  clock,
}: {
  dataDir: string;
  version: string;
  clock: Clock;
}): ErrorLog {
  const folder = join(dataDir, 'registros');
  return {
    record({ error, origin, phase }) {
      try {
        const line = logLine(
          unexpectedErrorEntry({ error, origin, phase, version, at: clock.now() }),
        );
        mkdirSync(folder, { recursive: true });
        rotateIfFull(folder, Buffer.byteLength(line));
        // Sincrónico: si Retenia se está cerrando, el renglón llega al disco antes de que termine.
        appendFileSync(join(folder, LOG_FILE_NAME), line, 'utf8');
        return true;
      } catch {
        return false;
      }
    },
  };
}

export interface UnexpectedErrorWatch {
  // Desde acá Retenia se está cerrando: los errores solo se anotan.
  quitting(): void;
}

// Escucha los dos caminos de un error sin atrapar: el error tirado (`uncaughtException`) y la promesa
// rechazada que nadie esperaba (`unhandledRejection`; en el proceso principal de Electron pasaba en
// silencio).
export function watchUnexpectedErrors({
  log,
  notify,
  windowOpen,
  stopwatch,
}: {
  log: ErrorLog;
  // Le manda el aviso a la ventana; devuelve false si no había a quién.
  notify: () => boolean;
  windowOpen: () => boolean;
  stopwatch: Stopwatch;
}): UnexpectedErrorWatch {
  let phase: AppPhase = 'running';
  let lastNoticeMs: number | null = null;
  const elapsed = stopwatch.start();

  function handle(error: unknown, origin: UnexpectedOrigin): void {
    try {
      log.record({ error, origin, phase });
      const nowMs = elapsed();
      if (shouldShowNotice({ phase, windowOpen: windowOpen(), lastNoticeMs, nowMs }) && notify()) {
        lastNoticeMs = nowMs;
      }
    } catch {
      // Nada de acá adentro puede tirar: un error dentro del manejador cerraría Retenia de golpe.
    }
  }

  process.on('uncaughtException', (error, origin) =>
    handle(error, origin === 'unhandledRejection' ? 'rejection' : 'exception'),
  );
  process.on('unhandledRejection', (reason) => handle(reason, 'rejection'));
  return {
    quitting: () => {
      phase = 'quitting';
    },
  };
}
