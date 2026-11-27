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

// Las marcas que la API agrega alrededor de los mensajes y del esquema de la salida, por las dudas.
const FRAMING_TOKENS = 1000;

// Los bytes de un texto en UTF-8, como viaja.
export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

// Lo máximo que puede costar un pedido antes de mandarlo: toda la salida permitida y, de entrada,
// una unidad por byte de lo que se manda, más las marcas de los mensajes. Ninguna unidad de texto
// ocupa menos de un byte, así que es un techo con cualquier idioma, emoji o símbolo (en castellano,
// las unidades reales salen de a tres o cuatro letras: el techo queda holgado).
export function maxCostMicros(
  { inputBytes, maxOutputTokens }: { inputBytes: number; maxOutputTokens: number },
  price: ModelPrice,
): number {
  return costMicros(
    {
      inputTokens: inputBytes + FRAMING_TOKENS,
      outputTokens: maxOutputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    price,
  );
}
