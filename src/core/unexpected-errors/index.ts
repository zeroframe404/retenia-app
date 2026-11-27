import { BUENOS_AIRES_ZONE } from '../clock';

// Un error que nadie atrapó en el proceso principal (docs/decisiones.md, 27/11/2026). Estas son las
// reglas puras: qué se anota en el registro de la carpeta de datos (sin secretos y con topes), cómo
// rota ese archivo y cuándo avisa la ventana. Quién escucha los errores y escribe el archivo vive en
// src/main/unexpected-errors.ts.

// Un error tirado que nadie atrapó (`uncaughtException`) o una promesa rechazada que nadie esperaba
// (`unhandledRejection`).
export type UnexpectedOrigin = 'exception' | 'rejection';
// Retenia abierta, o ya cerrándose (desde `before-quit`): cerrándose, solo se anota.
export type AppPhase = 'running' | 'quitting';

// Lo que se guarda de un error: su nombre, su código si tiene, el mensaje y dónde pasó.
export interface ErrorSummary {
  name: string;
  code?: string;
  message: string;
  stack: string[];
  cause?: ErrorSummary;
}

export interface UnexpectedErrorEntry {
  // Fecha y hora de Buenos Aires: «27/11/2026 14:03:05».
  at: string;
  event: 'main.uncaught-exception' | 'main.unhandled-rejection';
  phase: AppPhase;
  version: string;
  error: ErrorSummary;
}

export const MESSAGE_MAX_CHARS = 500;
export const STACK_MAX_FRAMES = 30;
const FRAME_MAX_CHARS = 300;
const NAME_MAX_CHARS = 100;
export const CAUSE_DEPTH = 3;

// Un error que se repite no llena la ventana de avisos: después de uno, el siguiente espera diez
// minutos. En el registro se anotan todos.
export const NOTICE_QUIET_MS = 10 * 60 * 1000;

export function shouldShowNotice({
  phase,
  windowOpen,
  lastNoticeMs,
  nowMs,
}: {
  phase: AppPhase;
  windowOpen: boolean;
  // Cuándo salió el aviso anterior, en milisegundos del mismo cronómetro que `nowMs`.
  lastNoticeMs: number | null;
  nowMs: number;
}): boolean {
  if (phase === 'quitting' || !windowOpen) {
    return false;
  }
  return lastNoticeMs === null || nowMs - lastNoticeMs >= NOTICE_QUIET_MS;
}

// Lo que se tapa antes de anotar: las claves de Anthropic (empiezan con «sk-ant-»), los tokens
// «Bearer» y lo que sigue a x-api-key, api_key o authorization (salvo lo que ya se tapó).
const SECRETS: ReadonlyArray<readonly [RegExp, string]> = [
  [/sk-ant-[A-Za-z0-9_-]*/g, '[clave oculta]'],
  [/\b(bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [oculto]'],
  [
    /\b(x-api-key|api[-_]?key|authorization)(["']?\s*[:=]\s*["']?)(?!bearer\b|\[)[^\s"',;}\]]+/gi,
    '$1$2[oculto]',
  ],
];

export function redactSecrets(text: string): string {
  let redacted = text;
  for (const [pattern, replacement] of SECRETS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

// Primero se tapa y después se corta: así ninguna clave queda partida al borde del tope.
function clean(text: string, max: number): string {
  const redacted = redactSecrets(text);
  return redacted.length <= max ? redacted : `${redacted.slice(0, max - 1)}…`;
}

const CODE = /^[A-Za-z0-9_.:-]{1,60}$/;

// De la pila, solo los renglones de dónde pasó («at …»): el primero repite el mensaje.
function framesOf(stack: unknown): string[] {
  if (typeof stack !== 'string') {
    return [];
  }
  return stack
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
    .slice(0, STACK_MAX_FRAMES)
    .map((line) => clean(line, FRAME_MAX_CHARS));
}

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  code?: unknown;
  cause?: unknown;
}

function summarize(value: unknown, depth: number): ErrorSummary {
  if (typeof value === 'string') {
    return { name: 'string', message: clean(value, MESSAGE_MAX_CHARS), stack: [] };
  }
  if (value === null) {
    return { name: 'null', message: '', stack: [] };
  }
  if (typeof value !== 'object') {
    return { name: typeof value, message: '', stack: [] };
  }
  const candidate = value as ErrorLike;
  if (typeof candidate.message !== 'string') {
    return { name: 'object', message: '', stack: [] };
  }
  const summary: ErrorSummary = {
    name:
      typeof candidate.name === 'string' && candidate.name !== ''
        ? clean(candidate.name, NAME_MAX_CHARS)
        : 'Error',
    message: clean(candidate.message, MESSAGE_MAX_CHARS),
    stack: framesOf(candidate.stack),
  };
  if (typeof candidate.code === 'string' && CODE.test(candidate.code)) {
    summary.code = candidate.code;
  }
  if (depth < CAUSE_DEPTH && candidate.cause !== undefined) {
    summary.cause = describeAt(candidate.cause, depth + 1);
  }
  return summary;
}

function describeAt(value: unknown, depth: number): ErrorSummary {
  try {
    return summarize(value, depth);
  } catch {
    // Un objeto que se rompe al leerlo (un Proxy, un getter que tira): se anota que no se pudo.
    return { name: 'unreadable', message: '', stack: [] };
  }
}

// Lo que se anota de cualquier valor que se haya tirado o con el que se haya rechazado una promesa.
// Nunca tira. De lo que no es un Error se anota solo el tipo; un texto suelto va como mensaje.
export function describeError(value: unknown): ErrorSummary {
  return describeAt(value, 0);
}

const dateTimeParts = new Intl.DateTimeFormat('en-US', {
  timeZone: BUENOS_AIRES_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

// «27/11/2026 14:03:05», hora de Buenos Aires.
function logDateTime(instant: Date): string {
  const parts = Object.fromEntries(
    dateTimeParts.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function unexpectedErrorEntry({
  error,
  origin,
  phase,
  version,
  at,
}: {
  error: unknown;
  origin: UnexpectedOrigin;
  phase: AppPhase;
  version: string;
  at: Date;
}): UnexpectedErrorEntry {
  return {
    at: logDateTime(at),
    event: origin === 'exception' ? 'main.uncaught-exception' : 'main.unhandled-rejection',
    phase,
    version,
    error: describeError(error),
  };
}

// Un renglón de JSON por error: se lee con cualquier herramienta y un error de varios renglones
// sigue ocupando uno solo.
export function logLine(entry: UnexpectedErrorEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

// El archivo: registros/retenia.log en la carpeta de datos (docs/arquitectura.md, «Registros»). Al
// pasar de 1 MB, empieza uno nuevo y se guardan los cinco anteriores: retenia.1.log es el más nuevo.
export const LOG_FILE_NAME = 'retenia.log';
export const LOG_MAX_BYTES = 1024 * 1024;
export const LOG_KEPT_FILES = 5;

function logFileName(index: number): string {
  return index === 0 ? LOG_FILE_NAME : `retenia.${index}.log`;
}

export function needsRotation(currentBytes: number, incomingBytes: number): boolean {
  return currentBytes > 0 && currentBytes + incomingBytes > LOG_MAX_BYTES;
}

// Los renombres de una rotación, en orden: del más viejo al de ahora. El más viejo (retenia.5.log)
// queda pisado por el que le sigue.
export function rotationRenames(): Array<{ from: string; to: string }> {
  const renames: Array<{ from: string; to: string }> = [];
  for (let index = LOG_KEPT_FILES - 1; index >= 0; index -= 1) {
    renames.push({ from: logFileName(index), to: logFileName(index + 1) });
  }
  return renames;
}
