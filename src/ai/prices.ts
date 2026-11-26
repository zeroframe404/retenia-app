import type { ModelPrice } from '../core/ai';
import table from './precios.json';

// La tabla de precios versionada (Fase 19, CA-169): con su fecha y de dónde salió. Se actualiza en
// las ventanas de actualización (docs/versiones.md) y su versión queda anotada en cada envío.

export const PRICES: {
  readonly version: string;
  readonly checkedOn: string;
  readonly models: Readonly<Record<string, ModelPrice | undefined>>;
} = table;

export function priceFor(model: string): ModelPrice {
  const price = PRICES.models[model];
  if (!price) {
    throw new Error(`No hay precio para el modelo ${model}`);
  }
  return price;
}
