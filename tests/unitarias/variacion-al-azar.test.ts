import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fuzzForVariant } from '../../src/main/memory-options';
import { ROOT } from '../../tools/lib/proceso.mjs';

// La variación al azar de las fechas de repaso (Fase 09): encendida solo en «Retenia» (uso real);
// apagada en «Retenia (prueba)», donde todo es demostración.

describe('variación al azar de las fechas', () => {
  it('va solo en el uso real, y el programa la pide al abrir los datos de «Retenia»', () => {
    expect(fuzzForVariant('real')).toBe(true);
    expect(fuzzForVariant('prueba')).toBe(false);
    const main = readFileSync(join(ROOT, 'src', 'main', 'index.ts'), 'utf8');
    expect(main).toMatch(/openWorkspace\(\{[^}]*fuzz: fuzzForVariant\(variant\)[^}]*\}\)/);
  });
});
