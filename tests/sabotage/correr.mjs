// «npm run sabotaje -- N» (N del 1 al 4): aplica el sabotaje, corre la red y muestra el ROJO,
// lo revierte y vuelve a correr la red para mostrar el VERDE. Termina bien solo si la red
// detectó el sabotaje nombrándolo y volvió a VERDE al revertirlo.
import { join } from 'node:path';
import { ROOT, run } from '../../tools/lib/proceso.mjs';
import { applySabotage, restoreLeftover, SABOTAGES } from './sabotajes.mjs';

const number = Number(process.argv[2]);
const sabotage = SABOTAGES[number];
if (!sabotage) {
  console.log('Decime qué sabotaje: npm run sabotaje -- 1 (hay del 1 al 4).');
  process.exit(1);
}

function fastNetwork() {
  const env = { ...process.env };
  delete env.RETENIA_RUN_DIR;
  return run(process.execPath, [join(ROOT, 'tools', 'verify.mjs')], { env });
}

/** @param {string} stdout */
function fromVerdict(stdout) {
  const lines = stdout.trimEnd().split(/\r?\n/);
  const start = lines.findIndex((l) => /^(VERDE|ROJO) · /.test(l));
  return start === -1 ? lines.slice(-15) : lines.slice(start);
}

if (restoreLeftover(ROOT)) {
  console.log(
    'Había quedado un sabotaje puesto de una corrida cortada: lo revertí antes de empezar.',
  );
}

console.log(`Sabotaje ${number} · ${sabotage.name}`);
const { files, revert } = applySabotage(number, ROOT);
/** @type {import('../../tools/lib/proceso.mjs').RunResult} */
let red;
try {
  console.log(`Aplicado en: ${files.join(', ')}`);
  if (number === 2) {
    const commit = await run(process.execPath, [
      join(ROOT, 'tools', 'hooks', 'secretos.mjs'),
      ...files,
    ]);
    console.log('Intento de guardar el cambio (gancho de commit):');
    console.log(commit.stderr.trim() || commit.stdout.trim());
  }
  console.log('Corriendo la red…');
  red = await fastNetwork();
} finally {
  revert();
}
const redLines = fromVerdict(red.stdout);
console.log(redLines.join('\n'));
console.log('Revertido.');
console.log('Corriendo la red de nuevo…');
const green = await fastNetwork();
const greenLines = fromVerdict(green.stdout);
console.log(greenLines.join('\n'));

const detected =
  redLines[0]?.startsWith('ROJO · ') === true && redLines.join('\n').includes(sabotage.expects);
const recovered = greenLines[0]?.startsWith('VERDE · ') === true;
if (!detected) {
  console.log(`La red NO detectó el sabotaje nombrando «${sabotage.expects}».`);
}
if (!recovered) {
  console.log('Al revertir, la red no volvió a VERDE.');
}
process.exitCode = detected && recovered ? 0 : 1;
