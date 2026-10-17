// Prepara lo que la red baja de internet, una sola vez y aceptándolo solo si su huella coincide:
// - Opengrep en tools/bin, con la huella SHA-256 anotada en docs/versiones.md (lo usa
//   «verificar:todo»).
// - Los modelos de voz de desarrollo, con el manifiesto de Retenia (src/main/models/manifest.ts):
//   los usan las pruebas de voz, la punta a punta y el humo del instalador.
// Lo llama la red cuando falta algo; también se puede correr a mano: «node tools/preparar.mjs».
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareDevModels } from './lib/preparar-modelos.mjs';
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

/** @returns {Promise<string | null>} el problema, o null si quedó listo */
async function prepareOpengrep() {
  if (process.platform !== 'win32') {
    return 'Opengrep se prepara solo en Windows (la PC de Retenia y el CI).';
  }
  if (existsSync(target) && sha256Of(target) === SHA256) {
    console.log(`Opengrep ${VERSION} ya está listo y su huella coincide.`);
    return null;
  }
  mkdirSync(folder, { recursive: true });
  console.log(`Bajando Opengrep ${VERSION}…`);
  const response = await fetch(URL);
  if (!response.ok) {
    return `No pude bajar Opengrep: el servidor respondió ${response.status}.`;
  }
  const download = `${target}.descarga`;
  writeFileSync(download, Buffer.from(await response.arrayBuffer()));
  const got = sha256Of(download);
  if (got !== SHA256) {
    rmSync(download, { force: true });
    return `La huella de Opengrep no coincide (esperaba ${SHA256} y llegó ${got}); no lo instalé.`;
  }
  renameSync(download, target);
  console.log('Opengrep listo: la huella coincide con la de docs/versiones.md.');
  return null;
}

const only = process.argv.includes('--modelos') ? 'modelos' : null;
const problems = [];
if (only !== 'modelos') {
  const problem = await prepareOpengrep().catch((error) => `No pude bajar Opengrep: ${error}`);
  if (problem) {
    problems.push(problem);
  }
}
const models = await prepareDevModels();
if (models) {
  problems.push(models);
}
for (const problem of problems) {
  console.log(problem);
}
process.exitCode = problems.length === 0 ? 0 : 1;
