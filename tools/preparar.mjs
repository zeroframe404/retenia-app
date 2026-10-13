// Baja Opengrep a tools/bin y lo acepta solo si su huella SHA-256 coincide con la anotada en
// docs/versiones.md. Lo llama solo «verificar:todo» cuando falta.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from './lib/proceso.mjs';

const VERSION = 'v1.30.2';
const ARCHIVO = 'opengrep_windows_x86.exe';
const HUELLA = '523b1074a81006436fec457e2daccf7cf7cacc04000d4482f1072a1b19bc6372';
const DIRECCION = `https://github.com/opengrep/opengrep/releases/download/${VERSION}/${ARCHIVO}`;

const carpeta = join(RAIZ, 'tools', 'bin');
const destino = join(carpeta, 'opengrep.exe');

function huellaDe(ruta) {
  return createHash('sha256').update(readFileSync(ruta)).digest('hex');
}

if (process.platform !== 'win32') {
  console.log('Opengrep se prepara solo en Windows (la PC de Retenia y el CI).');
  process.exit(1);
}
if (existsSync(destino) && huellaDe(destino) === HUELLA) {
  console.log(`Opengrep ${VERSION} ya está listo y su huella coincide.`);
  process.exit(0);
}

mkdirSync(carpeta, { recursive: true });
console.log(`Bajando Opengrep ${VERSION}…`);
const respuesta = await fetch(DIRECCION);
if (!respuesta.ok) {
  console.log(`No pude bajar Opengrep: el servidor respondió ${respuesta.status}.`);
  process.exit(1);
}
const temporal = `${destino}.descarga`;
writeFileSync(temporal, Buffer.from(await respuesta.arrayBuffer()));
const obtenida = huellaDe(temporal);
if (obtenida !== HUELLA) {
  rmSync(temporal, { force: true });
  console.log(
    `La huella de Opengrep no coincide (esperaba ${HUELLA} y llegó ${obtenida}); no lo instalé.`,
  );
  process.exit(1);
}
renameSync(temporal, destino);
console.log('Opengrep listo: la huella coincide con la de docs/versiones.md.');
