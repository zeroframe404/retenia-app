import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeProto, ProtobufError } from '../../src/core/imports/protobuf';
import { pbBytes, pbVarint } from '../../tools/datos-de-ejemplo/importaciones.mjs';

// El lector mínimo de protobuf con que se lee el formato actual de Anki (la lista de medios, el tipo
// de nota y sus plantillas, la versión del paquete). Lee lo que escribe un escritor de protobuf, salta
// lo que no conoce y ante bytes rotos falla con un error propio, sin colgarse.

const field = fc.integer({ min: 1, max: 300 });
const entry = fc.oneof(
  fc.record({
    kind: fc.constant('varint' as const),
    field,
    value: fc.bigInt({ min: 0n, max: 2n ** 63n }),
  }),
  fc.record({
    kind: fc.constant('bytes' as const),
    field,
    value: fc.uint8Array({ maxLength: 40 }),
  }),
  fc.record({ kind: fc.constant('text' as const), field, value: fc.string({ maxLength: 30 }) }),
);

describe('protobuf', () => {
  it('[CA-122] lee cada campo que escribió un escritor de protobuf, en orden', () => {
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 20 }), (entries) => {
        const bytes = Buffer.concat(
          entries.map((item) =>
            item.kind === 'varint'
              ? pbVarint(item.field, item.value)
              : pbBytes(item.field, item.kind === 'text' ? item.value : Buffer.from(item.value)),
          ),
        );
        const message = decodeProto(bytes);
        for (const item of entries) {
          const all =
            item.kind === 'varint' ? message.varints(item.field) : message.bytesList(item.field);
          expect(all.length).toBeGreaterThan(0);
        }
        const last = new Map(entries.map((item) => [item.field, item]));
        for (const [number, item] of last) {
          if (item.kind === 'varint') {
            expect(message.varints(number).at(-1)).toBe(item.value);
          } else if (item.kind === 'text') {
            expect(message.string(number)).toBe(item.value);
          } else {
            expect(Buffer.from(message.bytesList(number).at(-1) ?? [])).toEqual(
              Buffer.from(item.value),
            );
          }
        }
      }),
    );
  });

  it('[CA-122] bytes cualesquiera se leen o fallan con su error, nunca otra cosa', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), (bytes) => {
        try {
          decodeProto(bytes);
        } catch (error) {
          expect(error).toBeInstanceOf(ProtobufError);
        }
      }),
    );
  });

  it('[CA-122] un campo cortado a la mitad es un error', () => {
    const whole = pbBytes(1, 'una frase entera');
    expect(() => decodeProto(whole.subarray(0, whole.length - 3))).toThrow(ProtobufError);
  });
});
