import { describe, expect, it } from 'vitest';
import {
  CAUSE_DEPTH,
  describeError,
  LOG_FILE_NAME,
  LOG_KEPT_FILES,
  LOG_MAX_BYTES,
  logLine,
  MESSAGE_MAX_CHARS,
  NOTICE_QUIET_MS,
  needsRotation,
  redactSecrets,
  rotationRenames,
  STACK_MAX_FRAMES,
  shouldShowNotice,
  unexpectedErrorEntry,
} from '../../src/core/unexpected-errors';
import { TEST_KEY } from '../apoyo/caja-segura';

// Un error que nadie atrapó en el proceso principal (docs/decisiones.md, 27/11/2026): queda anotado
// en el registro de la carpeta de datos, sin secretos, y la ventana lo avisa con un texto del
// catálogo. Si Retenia ya se está cerrando, solo se anota: nunca traba el cierre.

// 14:03:05 del 27/11/2026 en Buenos Aires.
const AT = new Date('2026-11-27T17:03:05Z');

function errorWithStack(message: string, frames: string[]): Error {
  const error = new Error(message);
  error.stack = [`Error: ${message}`, ...frames.map((frame) => `    ${frame}`)].join('\n');
  return error;
}

describe('cuándo avisa la ventana', () => {
  it('con la ventana abierta, el primer error avisa', () => {
    expect(
      shouldShowNotice({ phase: 'running', windowOpen: true, lastNoticeMs: null, nowMs: 0 }),
    ).toBe(true);
  });

  it('si Retenia ya se está cerrando, solo se anota: no avisa', () => {
    expect(
      shouldShowNotice({ phase: 'quitting', windowOpen: true, lastNoticeMs: null, nowMs: 0 }),
    ).toBe(false);
  });

  it('sin la ventana abierta no avisa', () => {
    expect(
      shouldShowNotice({ phase: 'running', windowOpen: false, lastNoticeMs: null, nowMs: 0 }),
    ).toBe(false);
  });

  it('no repite el aviso antes de diez minutos, aunque los errores sigan', () => {
    expect(NOTICE_QUIET_MS).toBe(10 * 60 * 1000);
    const shown = 5000;
    expect(
      shouldShowNotice({
        phase: 'running',
        windowOpen: true,
        lastNoticeMs: shown,
        nowMs: shown + NOTICE_QUIET_MS - 1,
      }),
    ).toBe(false);
    expect(
      shouldShowNotice({
        phase: 'running',
        windowOpen: true,
        lastNoticeMs: shown,
        nowMs: shown + NOTICE_QUIET_MS,
      }),
    ).toBe(true);
  });
});

describe('qué se anota de un error', () => {
  it('el nombre, el código, el mensaje y dónde pasó', () => {
    const error = Object.assign(
      errorWithStack('La carpeta de datos ya se cerró', [
        'at start (file:///C:/retenia/out/main/index.js:12:34)',
        'at Timeout._onTimeout (node:internal/timers:594:17)',
      ]),
      { code: 'ERR_CARPETA_CERRADA' },
    );
    expect(describeError(error)).toEqual({
      name: 'Error',
      code: 'ERR_CARPETA_CERRADA',
      message: 'La carpeta de datos ya se cerró',
      stack: [
        'at start (file:///C:/retenia/out/main/index.js:12:34)',
        'at Timeout._onTimeout (node:internal/timers:594:17)',
      ],
    });
  });

  it('la pila no repite el mensaje: guarda solo los renglones de dónde pasó', () => {
    const error = errorWithStack('primer renglón\nsegundo renglón', ['at f (archivo.js:1:1)']);
    expect(describeError(error).stack).toEqual(['at f (archivo.js:1:1)']);
  });

  it('un tipo de error propio conserva su nombre', () => {
    class ClosedFolderError extends Error {
      override name = 'ClosedFolderError';
    }
    expect(describeError(new ClosedFolderError('cerrada')).name).toBe('ClosedFolderError');
  });

  it('la clave de la IA nunca llega al registro: ni en el mensaje, ni en la pila, ni en la causa', () => {
    const cause = new Error(`401 con la clave ${TEST_KEY}`);
    const error = new Error(`falló el pedido con x-api-key: ${TEST_KEY}`, { cause });
    error.stack = `Error: falló\n    at pedir (https://api.anthropic.com/v1?${TEST_KEY}:1:1)`;
    const line = logLine(
      unexpectedErrorEntry({
        error,
        origin: 'exception',
        phase: 'running',
        version: '0.19.0',
        at: AT,
      }),
    );
    expect(line).not.toContain(TEST_KEY);
    expect(line).not.toContain('RETENIA-CLAVE-DE-PRUEBA');
    expect(line).toContain('[clave oculta]');
  });

  it('tapa también un token «Bearer» y lo que va después de x-api-key, api_key o authorization', () => {
    expect(redactSecrets('Authorization: Bearer eyJhbGciOi.abc-123_456')).toBe(
      'Authorization: Bearer [oculto]',
    );
    expect(redactSecrets('x-api-key: 0123456789abcdef y sigue')).toBe(
      'x-api-key: [oculto] y sigue',
    );
    expect(redactSecrets('{"x-api-key":"abc123def456"}')).toBe('{"x-api-key":"[oculto]"}');
    expect(redactSecrets('api_key=abc123')).toBe('api_key=[oculto]');
    expect(redactSecrets('La carpeta de datos ya se cerró')).toBe(
      'La carpeta de datos ya se cerró',
    );
  });

  it(`un mensaje muy largo se corta a ${MESSAGE_MAX_CHARS} caracteres`, () => {
    expect(MESSAGE_MAX_CHARS).toBe(500);
    const message = describeError(new Error('a'.repeat(2000))).message;
    expect(message).toHaveLength(MESSAGE_MAX_CHARS);
    expect(message.endsWith('…')).toBe(true);
  });

  it(`la pila guarda hasta ${STACK_MAX_FRAMES} renglones`, () => {
    expect(STACK_MAX_FRAMES).toBe(30);
    const frames = Array.from(
      { length: 50 },
      (_, index) => `at paso${index} (archivo.js:${index}:1)`,
    );
    const stack = describeError(errorWithStack('hondo', frames)).stack;
    expect(stack).toHaveLength(STACK_MAX_FRAMES);
    expect(stack[0]).toBe('at paso0 (archivo.js:0:1)');
  });

  it(`las causas se anotan hasta ${CAUSE_DEPTH} niveles`, () => {
    expect(CAUSE_DEPTH).toBe(3);
    let error = new Error('nivel 5');
    for (let level = 4; level >= 0; level -= 1) {
      error = new Error(`nivel ${level}`, { cause: error });
    }
    const described = describeError(error);
    expect(described.cause?.cause?.cause?.message).toBe('nivel 3');
    expect(described.cause?.cause?.cause?.cause).toBeUndefined();
  });

  it('lo que no es un Error se anota por su tipo, sin su contenido; un texto, como mensaje', () => {
    expect(describeError(undefined)).toEqual({ name: 'undefined', message: '', stack: [] });
    expect(describeError(null)).toEqual({ name: 'null', message: '', stack: [] });
    expect(describeError(42)).toEqual({ name: 'number', message: '', stack: [] });
    expect(describeError({ algo: 'privado' })).toEqual({ name: 'object', message: '', stack: [] });
    expect(describeError(`se cortó con ${TEST_KEY}`)).toEqual({
      name: 'string',
      message: 'se cortó con [clave oculta]',
      stack: [],
    });
  });

  it('un objeto que se rompe al leerlo no rompe el registro', () => {
    const trap = new Proxy(
      {},
      {
        get() {
          throw new Error('no me leas');
        },
        getPrototypeOf() {
          throw new Error('no me leas');
        },
      },
    );
    expect(describeError(trap)).toEqual({ name: 'unreadable', message: '', stack: [] });
  });

  it('la entrada lleva la fecha y la hora de Buenos Aires, qué pasó, en qué momento y la versión', () => {
    expect(
      unexpectedErrorEntry({
        error: new Error('x'),
        origin: 'exception',
        phase: 'running',
        version: '0.19.0',
        at: AT,
      }),
    ).toMatchObject({
      at: '27/11/2026 14:03:05',
      event: 'main.uncaught-exception',
      phase: 'running',
      version: '0.19.0',
      error: { name: 'Error', message: 'x' },
    });
    expect(
      unexpectedErrorEntry({
        error: new Error('y'),
        origin: 'rejection',
        phase: 'quitting',
        version: '0.19.0',
        at: AT,
      }),
    ).toMatchObject({ event: 'main.unhandled-rejection', phase: 'quitting' });
  });

  it('cada entrada es un renglón de JSON', () => {
    const entry = unexpectedErrorEntry({
      error: errorWithStack('con\nvarios\nrenglones', ['at f (archivo.js:1:1)']),
      origin: 'exception',
      phase: 'running',
      version: '0.19.0',
      at: AT,
    });
    const line = logLine(entry);
    expect(line.endsWith('\n')).toBe(true);
    expect(line.slice(0, -1)).not.toContain('\n');
    expect(JSON.parse(line)).toEqual(entry);
  });
});

describe('el archivo del registro', () => {
  it('es retenia.log y guarda cinco anteriores de 1 MB', () => {
    expect(LOG_FILE_NAME).toBe('retenia.log');
    expect(LOG_MAX_BYTES).toBe(1024 * 1024);
    expect(LOG_KEPT_FILES).toBe(5);
  });

  it('empieza uno nuevo cuando el renglón haría pasar el archivo de 1 MB', () => {
    expect(needsRotation(LOG_MAX_BYTES - 10, 10)).toBe(false);
    expect(needsRotation(LOG_MAX_BYTES - 10, 11)).toBe(true);
    // Un archivo vacío no se rota, aunque el renglón sea enorme.
    expect(needsRotation(0, LOG_MAX_BYTES + 5)).toBe(false);
  });

  it('al empezar uno nuevo, cada anterior pasa al número siguiente y el más viejo se descarta', () => {
    expect(rotationRenames()).toEqual([
      { from: 'retenia.4.log', to: 'retenia.5.log' },
      { from: 'retenia.3.log', to: 'retenia.4.log' },
      { from: 'retenia.2.log', to: 'retenia.3.log' },
      { from: 'retenia.1.log', to: 'retenia.2.log' },
      { from: 'retenia.log', to: 'retenia.1.log' },
    ]);
  });
});
