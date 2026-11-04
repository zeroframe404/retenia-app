import type { Variant } from './bridge';

// La variación al azar de las fechas de repaso (Fase 09): solo en «Retenia», el uso real. En
// «Retenia (prueba)» todo es demostración, y ahí las fechas no varían.
export function fuzzForVariant(variant: Variant): boolean {
  return variant === 'real';
}
