// Baja Opengrep a tools/bin y lo acepta solo si su huella SHA-256 coincide con la anotada en
// docs/versiones.md. Lo llama solo «verificar:todo» cuando falta.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/proceso.mjs';

const VERSION = 'v1.30.2';
const ASSET = 'opengrep_windows_x86.exe';
const SHA256 = '523b1074a81006436fec457e2daccf7cf7cacc04000d4482f1072a1b19bc6372';
const URL = `https://github.com/opengrep/opengrep/releases/download/${VERSION}/${ASSET}`;

const folder = join(ROOT, 'tools', 'bin');
const target = join(folder, 'opengrep.exe');

/** @param {string} path */
function sha256Of(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

if (process.platform !== 'win32') {
  console.log('Opengrep se prepara solo en Windows (la PC de Retenia y el CI).');
  process.exit(1);
}
if (existsSync(target) && sha256Of(target) === SHA256) {
  console.log(`Opengrep ${VERSION} ya está listo y su huella coincide.`);
  process.exit(0);
}

mkdirSync(folder, { recursive: true });
console.log(`Bajando Opengrep ${VERSION}…`);
const response = await fetch(URL);
if (!response.ok) {
  console.log(`No pude bajar Opengrep: el servidor respondió ${response.status}.`);
  process.exit(1);
}
const download = `${target}.descarga`;
writeFileSync(download, Buffer.from(await response.arrayBuffer()));
const got = sha256Of(download);
if (got !== SHA256) {
  rmSync(download, { force: true });
  console.log(
    `La huella de Opengrep no coincide (esperaba ${SHA256} y llegó ${got}); no lo instalé.`,
  );
  process.exit(1);
}
renameSync(download, target);
console.log('Opengrep listo: la huella coincide con la de docs/versiones.md.');
