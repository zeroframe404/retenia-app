import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  logLine,
  MESSAGE_MAX_CHARS,
  STACK_MAX_FRAMES,
  unexpectedErrorEntry,
} from '../../src/core/unexpected-errors';

// El registro de los errores inesperados (docs/decisiones.md, 27/11/2026): pase lo que pase, una
// clave de la IA no llega al archivo, y anotar un error nunca falla.

const SEED = 20261127;
const AT = new Date('2026-11-27T17:03:05Z');

function lineFor(error: unknown): string {
  return logLine(
    unexpectedErrorEntry({
      error,
      origin: 'exception',
      phase: 'running',
      version: '0.19.0',
      at: AT,
    }),
  );
}

// El cuerpo de una clave de Anthropic: letras, números, guiones y guiones bajos.
const keyBody = fc.stringMatching(/^[A-Za-z0-9_-]{20,100}$/);

describe('registro de los errores inesperados', () => {
  it('ninguna clave con la forma de las de Anthropic queda en el renglón, la pongan donde la pongan', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), keyBody, (before, after, body) => {
        const key = `sk-ant-api03-${body}`;
        const cause = new Error(`${after}${key}`);
        const error = new Error(`${before}${key}${after}`, { cause });
        error.stack = `Error: ${before}\n    at pedir (${before}${key}${after}:1:1)`;
        const line = lineFor(error);
        return !line.includes(key) && !line.includes(body);
      }),
      { seed: SEED, numRuns: 500 },
    );
  });

  it('anotar cualquier valor nunca falla y deja un solo renglón de JSON con sus topes', () => {
    const errors = fc
      .record({ message: fc.string(), stack: fc.string() })
      .map(({ message, stack }) => {
        const error = new Error(message);
        error.stack = stack;
        return error;
      });
    fc.assert(
      fc.property(fc.oneof(fc.anything(), errors), (value) => {
        const line = lineFor(value);
        expect(line.endsWith('\n')).toBe(true);
        expect(line.slice(0, -1)).not.toContain('\n');
        const parsed = JSON.parse(line);
        expect(parsed.error.message.length).toBeLessThanOrEqual(MESSAGE_MAX_CHARS);
        expect(parsed.error.stack.length).toBeLessThanOrEqual(STACK_MAX_FRAMES);
      }),
      { seed: SEED, numRuns: 500 },
    );
  });
});
