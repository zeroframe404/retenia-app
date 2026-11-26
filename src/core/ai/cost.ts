// El costo de una consulta a la IA, calculado en la PC (Fase 19, CA-169): en millonésimas de dólar,
// enteras, para que sumar el mes no acumule errores de redondeo. Los precios son en dólares por
// millón de unidades de texto: una unidad a USD 4 el millón cuesta 4 millonésimas.

export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

export interface ModelPrice {
  readonly inputPerMTok: number;
  readonly outputPerMTok: number;
  readonly cacheReadPerMTok: number;
  readonly cacheWritePerMTok: number;
}

// Redondea para arriba: nunca anota menos de lo gastado.
export function costMicros(usage: Usage, price: ModelPrice): number {
  const exact =
    usage.inputTokens * price.inputPerMTok +
    usage.outputTokens * price.outputPerMTok +
    usage.cacheReadTokens * price.cacheReadPerMTok +
    usage.cacheWriteTokens * price.cacheWritePerMTok;
  // Sin la parte que agrega la aritmética de coma flotante (0,1 × 3 da 0,30000000000000004).
  return Math.ceil(Number(exact.toFixed(6)));
}

// Lo máximo que puede costar un pedido antes de mandarlo: toda la salida permitida y, de entrada,
// una unidad cada dos letras (las unidades reales salen de a tres o cuatro letras en castellano).
export function maxCostMicros(
  { inputChars, maxOutputTokens }: { inputChars: number; maxOutputTokens: number },
  price: ModelPrice,
): number {
  return costMicros(
    {
      inputTokens: Math.ceil(inputChars / 2),
      outputTokens: maxOutputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    price,
  );
}
