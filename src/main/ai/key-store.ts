import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// La clave de la IA (Fase 19, CA-168): vive solo cifrada por el almacén seguro de Windows
// (`safeStorage` de Electron, que usa DPAPI) en `clave.bin` de la carpeta de datos. Nunca va a la
// base, a `ajustes.json`, a una copia, a una exportación, a un registro ni a la ventana: se descifra
// en el principal solo para armar cada pedido. Si Windows no puede cifrar, no se guarda en ningún
// lado y la IA queda apagada.

// Lo que hace falta del almacén seguro (en el programa, `safeStorage`; en las pruebas, un doble).
export interface SecretBox {
  isEncryptionAvailable(): boolean;
  encryptString(text: string): Buffer;
  decryptString(data: Buffer): string;
}

export class InsecureStorageError extends Error {
  constructor() {
    super('No hay cifrado disponible en esta PC');
    this.name = 'InsecureStorageError';
  }
}

export interface KeyStore {
  has(): boolean;
  read(): string | null;
  save(key: string): void;
  remove(): void;
  secure(): boolean;
}

const KEY_FILE = 'clave.bin';

export function createKeyStore({ dataDir, box }: { dataDir: string; box: SecretBox }): KeyStore {
  const file = join(dataDir, KEY_FILE);
  const secure = () => {
    try {
      return box.isEncryptionAvailable();
    } catch {
      return false;
    }
  };
  return {
    has: () => existsSync(file),
    secure,
    read() {
      if (!existsSync(file)) {
        return null;
      }
      try {
        return box.decryptString(readFileSync(file));
      } catch {
        // Una clave guardada en otra cuenta de Windows (o dañada) no se puede leer: es como no tenerla.
        return null;
      }
    },
    save(key) {
      if (!secure()) {
        throw new InsecureStorageError();
      }
      const sealed = box.encryptString(key);
      mkdirSync(dataDir, { recursive: true });
      const temporary = `${file}.tmp`;
      writeFileSync(temporary, sealed);
      renameSync(temporary, file);
    },
    remove() {
      rmSync(file, { force: true });
    },
  };
}
