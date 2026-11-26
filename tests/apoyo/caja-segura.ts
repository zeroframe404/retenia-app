import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import type { SecretBox } from '../../src/main/ai/key-store';

// El almacén seguro de Windows (simulado, declarado en docs/plan-de-pruebas.md §4). Las pruebas sin
// Electron no tienen DPAPI: esta caja cifra con AES-GCM y una clave fija de prueba, así lo guardado
// nunca queda en claro. En la punta a punta y en el programa se usa `safeStorage` de verdad.
// Con `available: false` hace de una PC sin cifrado disponible.

const KEY = createHash('sha256').update('retenia: caja de prueba (simulado)').digest();

// Una clave de IA inventada: nunca sirve para nada fuera de las pruebas.
export const TEST_KEY = 'sk-ant-api03-RETENIA-CLAVE-DE-PRUEBA-FASE-19-0123456789abcdefABCDEF';

export function testSecretBox({ available = true }: { available?: boolean } = {}): SecretBox {
  return {
    isEncryptionAvailable: () => available,
    encryptString(text) {
      if (!available) {
        throw new Error('(simulado) sin cifrado disponible');
      }
      // Determinista (pruebas sin azar): el vector sale del texto.
      const iv = createHash('sha256').update(text).digest().subarray(0, 12);
      const cipher = createCipheriv('aes-256-gcm', KEY, iv);
      const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]);
    },
    decryptString(buffer) {
      const iv = buffer.subarray(0, 12);
      const tag = buffer.subarray(12, 28);
      const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString(
        'utf8',
      );
    },
  };
}
