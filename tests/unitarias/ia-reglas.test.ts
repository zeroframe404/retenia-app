import { describe, expect, it } from 'vitest';
import {
  capState,
  costMicros,
  DEFAULT_CAP_CENTS,
  decideRequest,
  deliveryFor,
  fitsUnderCap,
  functionState,
  maxCostMicros,
  monthBounds,
  monthOf,
  percentUsed,
  type RequestFacts,
  retiresSoon,
} from '../../src/core/ai';

// Las reglas puras de la compuerta de IA (Fase 19): qué entrega cada nivel, cuánto cuesta una
// consulta, el tope del mes, el estado de cada función y el orden de los controles de un pedido.

const OPUS = { inputPerMTok: 4, outputPerMTok: 20, cacheReadPerMTok: 0.2, cacheWritePerMTok: 5 };
const NO_USAGE = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

describe('IA: qué entrega cada nivel de consecuencia', () => {
  it('[CA-174] la exploración solo se muestra; la práctica queda como propuesta; el dominio pide una verificación', () => {
    expect(deliveryFor('exploration')).toBe('show');
    expect(deliveryFor('practice')).toBe('proposal');
    expect(deliveryFor('mastery')).toBe('proposal_with_check');
  });
});

describe('IA: el costo de una consulta', () => {
  it('[CA-169] se calcula en millonésimas de dólar con la tabla de precios', () => {
    // 1.000 unidades de entrada a USD 4 el millón y 500 de salida a USD 20: 0,004 + 0,01 = 0,014.
    expect(costMicros({ ...NO_USAGE, inputTokens: 1000, outputTokens: 500 }, OPUS)).toBe(14_000);
  });

  it('suma lo que se lee y lo que se escribe en la caché del proveedor', () => {
    expect(costMicros({ ...NO_USAGE, cacheReadTokens: 10_000, cacheWriteTokens: 1000 }, OPUS)).toBe(
      2000 + 5000,
    );
  });

  it('redondea para arriba: nunca anota menos de lo gastado', () => {
    const cheap = { ...OPUS, inputPerMTok: 0.1 };
    expect(costMicros({ ...NO_USAGE, inputTokens: 3 }, cheap)).toBe(1);
    expect(costMicros(NO_USAGE, OPUS)).toBe(0);
  });

  it('[CA-169] lo máximo que puede costar un pedido cuenta toda la salida y una unidad de entrada cada dos letras', () => {
    expect(maxCostMicros({ inputChars: 4000, maxOutputTokens: 2000 }, OPUS)).toBe(
      2000 * 4 + 2000 * 20,
    );
    expect(maxCostMicros({ inputChars: 3, maxOutputTokens: 0 }, OPUS)).toBe(2 * 4);
  });
});

describe('IA: el tope del mes', () => {
  it('el tope por defecto es de USD 10', () => {
    expect(DEFAULT_CAP_CENTS).toBe(1000);
  });

  it('[CA-169] con un tope de USD 10, USD 7,99 no avisa, USD 8 avisa y USD 10 frena', () => {
    expect(capState(7_990_000, 1000)).toBe('ok');
    expect(capState(8_000_000, 1000)).toBe('warning');
    expect(capState(9_999_999, 1000)).toBe('warning');
    expect(capState(10_000_000, 1000)).toBe('reached');
    expect(capState(12_000_000, 1000)).toBe('reached');
  });

  it('el porcentaje usado se redondea para abajo', () => {
    expect(percentUsed(8_400_000, 1000)).toBe(84);
    expect(percentUsed(8_499_999, 1000)).toBe(84);
    expect(percentUsed(0, 1000)).toBe(0);
  });

  it('[CA-169] una consulta entra solo si, con lo máximo que puede costar, no pasa el tope', () => {
    expect(fitsUnderCap(9_952_000, 1000, 48_000)).toBe(true);
    expect(fitsUnderCap(9_952_001, 1000, 48_000)).toBe(false);
    // Al 100 % no entra nada, ni lo que no cuesta.
    expect(fitsUnderCap(10_000_000, 1000, 0)).toBe(false);
  });

  it('[CA-169] el mes es el de Buenos Aires', () => {
    // 31/03/2027 23:30 en Buenos Aires ya es abril en UTC.
    expect(monthOf(new Date('2027-04-01T02:30:00Z'))).toBe('2027-03');
    expect(monthOf(new Date('2027-04-01T03:00:00Z'))).toBe('2027-04');
    expect(monthBounds('2027-03')).toEqual({
      from: '2027-03-01T03:00:00.000Z',
      to: '2027-04-01T03:00:00.000Z',
    });
    expect(monthBounds('2027-12')).toEqual({
      from: '2027-12-01T03:00:00.000Z',
      to: '2028-01-01T03:00:00.000Z',
    });
  });
});

describe('IA: el estado de cada función', () => {
  it('«Habilitada», «En revisión» o «Suspendida»; suspender manda sobre lo demás', () => {
    expect(functionState({ suspended: false, inReview: false })).toBe('enabled');
    expect(functionState({ suspended: false, inReview: true })).toBe('in_review');
    expect(functionState({ suspended: true, inReview: true })).toBe('suspended');
  });
});

describe('IA: cuándo avisar que el modelo se retira', () => {
  it('avisa desde 60 días antes de la fecha a partir de la cual se puede retirar', () => {
    expect(retiresSoon('2027-07-23', '2027-09-22')).toBe(false);
    expect(retiresSoon('2027-07-24', '2027-09-22')).toBe(true);
    expect(retiresSoon('2027-10-01', '2027-09-22')).toBe(true);
  });
});

describe('IA: el orden de los controles de un pedido', () => {
  const facts: RequestFacts = {
    functionState: 'enabled',
    localOnly: false,
    provider: 'remote',
    fragmentChars: 100,
    maxChars: 4000,
    spentMicros: 0,
    capCents: 1000,
    nextMaxMicros: 48_000,
    cached: false,
    permission: null,
    choice: null,
  };

  it('una función suspendida no hace nada', () => {
    expect(decideRequest({ ...facts, functionState: 'suspended', localOnly: true })).toEqual({
      action: 'block',
      reason: 'suspended',
    });
  });

  it('[CA-170] con «Modo solo local» se corta antes de todo lo demás, también lo guardado', () => {
    expect(decideRequest({ ...facts, localOnly: true, cached: true })).toEqual({
      action: 'block',
      reason: 'local_only',
    });
    expect(decideRequest({ ...facts, localOnly: true, provider: 'none' })).toEqual({
      action: 'block',
      reason: 'local_only',
    });
  });

  it('[CA-167] sin IA conectada dice que hay que conectarla', () => {
    expect(decideRequest({ ...facts, provider: 'none' })).toEqual({
      action: 'block',
      reason: 'not_connected',
    });
  });

  it('un pasaje demasiado largo no se manda', () => {
    expect(decideRequest({ ...facts, fragmentChars: 4001 })).toEqual({
      action: 'block',
      reason: 'too_long',
    });
  });

  it('[CA-169] con el tope alcanzado se frena, aunque la respuesta esté guardada', () => {
    expect(decideRequest({ ...facts, spentMicros: 10_000_000, cached: true })).toEqual({
      action: 'block',
      reason: 'cap_reached',
    });
    expect(decideRequest({ ...facts, spentMicros: 9_960_000 })).toEqual({
      action: 'block',
      reason: 'cap_reached',
    });
  });

  it('una respuesta ya guardada se muestra sin preguntar el permiso: no sale nada de la PC', () => {
    expect(decideRequest({ ...facts, cached: true })).toEqual({ action: 'serve_cache' });
  });

  it('[CA-172] un material que nunca fue a la IA pregunta el permiso', () => {
    expect(decideRequest(facts)).toEqual({ action: 'ask_permission' });
  });

  it('[CA-172] «Solo esta vez» y «Siempre para este material» lo mandan; «No» lo frena', () => {
    expect(decideRequest({ ...facts, choice: 'once' })).toEqual({ action: 'send' });
    expect(decideRequest({ ...facts, choice: 'always' })).toEqual({ action: 'send' });
    expect(decideRequest({ ...facts, choice: 'never' })).toEqual({
      action: 'block',
      reason: 'permission_denied',
    });
  });

  it('[CA-172] lo que ya decidiste vale la próxima vez, salvo que elijas otra cosa', () => {
    expect(decideRequest({ ...facts, permission: 'always' })).toEqual({ action: 'send' });
    expect(decideRequest({ ...facts, permission: 'never' })).toEqual({
      action: 'block',
      reason: 'permission_denied',
    });
    expect(decideRequest({ ...facts, permission: 'never', choice: 'once' })).toEqual({
      action: 'send',
    });
  });

  it('la IA simulada de la demostración no saca nada de la PC: no pregunta el permiso ni mira el tope', () => {
    expect(decideRequest({ ...facts, provider: 'local', spentMicros: 10_000_000 })).toEqual({
      action: 'send',
    });
  });
});
