// Un lector mínimo de protobuf para el formato actual de Anki (su versión del paquete, la lista de
// medios, el tipo de nota y sus plantillas). Lee varint, campos con largo y los de 32 y 64 bits, y
// saltea lo que no conoce. Bytes rotos dan un ProtobufError, nunca otra cosa ni un bucle sin fin.

export class ProtobufError extends Error {
  constructor(reason: string) {
    super(`Protobuf ilegible: ${reason}`);
    this.name = 'ProtobufError';
  }
}

type Value = { wire: 0; value: bigint } | { wire: 1 | 2 | 5; bytes: Uint8Array };

export interface ProtoMessage {
  varints(field: number): bigint[];
  varint(field: number): bigint | null;
  bytesList(field: number): Uint8Array[];
  bytes(field: number): Uint8Array | null;
  // El último texto del campo (UTF-8); '' si no está.
  string(field: number): string;
}

const MAX_VARINT_BYTES = 10;
const decoder = new TextDecoder('utf-8', { fatal: true });

export function decodeProto(input: Uint8Array): ProtoMessage {
  const fields = new Map<number, Value[]>();
  let at = 0;
  const readVarint = (): bigint => {
    let result = 0n;
    let shift = 0n;
    for (let count = 0; count < MAX_VARINT_BYTES; count++) {
      if (at >= input.length) {
        throw new ProtobufError('un número cortado');
      }
      const byte = input[at++] ?? 0;
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        return result;
      }
      shift += 7n;
    }
    throw new ProtobufError('un número demasiado largo');
  };
  const take = (length: number): Uint8Array => {
    if (length < 0 || at + length > input.length) {
      throw new ProtobufError('un campo cortado');
    }
    const slice = input.subarray(at, at + length);
    at += length;
    return slice;
  };
  while (at < input.length) {
    const key = readVarint();
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (field < 1 || field > 536_870_911) {
      throw new ProtobufError('un número de campo imposible');
    }
    let value: Value;
    if (wire === 0) {
      value = { wire: 0, value: readVarint() };
    } else if (wire === 2) {
      const length = readVarint();
      if (length > BigInt(input.length)) {
        throw new ProtobufError('un campo cortado');
      }
      value = { wire: 2, bytes: take(Number(length)) };
    } else if (wire === 1) {
      value = { wire: 1, bytes: take(8) };
    } else if (wire === 5) {
      value = { wire: 5, bytes: take(4) };
    } else {
      throw new ProtobufError('un tipo de campo desconocido');
    }
    const list = fields.get(field);
    if (list) {
      list.push(value);
    } else {
      fields.set(field, [value]);
    }
  }
  const varints = (field: number) =>
    (fields.get(field) ?? []).flatMap((item) => (item.wire === 0 ? [item.value] : []));
  const bytesList = (field: number) =>
    (fields.get(field) ?? []).flatMap((item) => (item.wire === 2 ? [item.bytes] : []));
  return {
    varints,
    varint: (field) => varints(field).at(-1) ?? null,
    bytesList,
    bytes: (field) => bytesList(field).at(-1) ?? null,
    string: (field) => {
      const last = bytesList(field).at(-1);
      if (last === undefined) {
        return '';
      }
      try {
        return decoder.decode(last);
      } catch {
        throw new ProtobufError('un texto que no es UTF-8');
      }
    },
  };
}
