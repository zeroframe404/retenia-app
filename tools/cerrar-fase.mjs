// «npm run cerrar-fase -- NN»: se usa una sola vez por fase, después de que el dueño aprueba
// las pruebas manuales y se fusiona el pull request. Con el árbol limpio, corre
// «verificar:todo» exigiendo los criterios de la fase NN y, si da VERDE, pone el tag
// fase-NN-ok con la cantidad de pruebas de cada orden en su mensaje (la red compara contra
// esos números de ahí en adelante). No sube nada: el tag se sube aparte.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tagMessage } from './lib/fases.mjs';
import { ROOT, run } from './lib/proceso.mjs';

const phase = process.argv[2]?.padStart(2, '0');
if (!phase || !/^\d{2}$/.test(phase)) {
  console.log('Decime qué fase cerrar: npm run cerrar-fase -- 02');
  process.exit(1);
}
const tag = `fase-${phase}-ok`;

const status = await run('git', ['status', '--porcelain']);
if (status.code !== 0 || status.stdout.trim() !== '') {
  console.log(
    'No cierro la fase: hay cambios sin guardar en git. Hacé commit o descartalos antes.',
  );
  process.exit(1);
}
const existing = await run('git', ['tag', '--list', tag]);
if (existing.stdout.trim() !== '') {
  console.log(`El tag ${tag} ya existe.`);
  process.exit(1);
}

console.log(`Corriendo la red completa para cerrar la Fase ${phase}…`);
const env = { ...process.env, RETENIA_FASE: phase };
delete env.RETENIA_RUN_DIR;
const network = await run(process.execPath, [join(ROOT, 'tools', 'verify.mjs'), '--todo'], { env });
const lines = network.stdout.trimEnd().split(/\r?\n/);
const verdictAt = lines.findIndex((l) => /^(VERDE|ROJO) · /.test(l));
console.log(lines.slice(verdictAt === -1 ? -20 : verdictAt).join('\n'));
if (network.code !== 0) {
  console.log(`No puse el tag ${tag}: la red no dio VERDE.`);
  process.exit(1);
}

const result = JSON.parse(
  readFileSync(join(ROOT, '.cache', 'red', 'corridas', 'todo', 'resultado.json'), 'utf8'),
);
const message = tagMessage(result.counts, phase);
const tagged = await run('git', ['tag', '-a', tag, '-m', message]);
if (tagged.code !== 0) {
  console.log(`No pude poner el tag ${tag}: ${tagged.stderr.trim()}`);
  process.exit(1);
}
console.log(`Tag ${tag} puesto:`);
console.log(message);
console.log(`Para subirlo: git push origin ${tag}`);
