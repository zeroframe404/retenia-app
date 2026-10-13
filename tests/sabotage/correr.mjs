// «npm run sabotaje -- N» (N del 1 al 4): aplica el sabotaje, corre la red y muestra el ROJO,
// lo revierte y vuelve a correr la red para mostrar el VERDE. Termina bien solo si la red
// detectó el sabotaje nombrándolo y volvió a VERDE al revertirlo.
import { join } from 'node:path';
import { correr, RAIZ } from '../../tools/lib/proceso.mjs';
import { aplicarSabotaje, restaurarSiQuedoAlgo, SABOTAJES } from './sabotajes.mjs';

const numero = Number(process.argv[2]);
const sabotaje = SABOTAJES[numero];
if (!sabotaje) {
  console.log('Decime qué sabotaje: npm run sabotaje -- 1 (hay del 1 al 4).');
  process.exit(1);
}

function redRapida() {
  const env = { ...process.env };
  delete env.RETENIA_RED_DIR;
  return correr(process.execPath, [join(RAIZ, 'tools', 'verify.mjs')], { env });
}

function desdeElVeredicto(salida) {
  const renglones = salida.trimEnd().split(/\r?\n/);
  const desde = renglones.findIndex((r) => /^(VERDE|ROJO) · /.test(r));
  return desde === -1 ? renglones.slice(-15) : renglones.slice(desde);
}

if (restaurarSiQuedoAlgo(RAIZ)) {
  console.log(
    'Había quedado un sabotaje puesto de una corrida cortada: lo revertí antes de empezar.',
  );
}

console.log(`Sabotaje ${numero} · ${sabotaje.nombre}`);
const { archivos, revertir } = aplicarSabotaje(numero, RAIZ);
let rojo;
try {
  console.log(`Aplicado en: ${archivos.join(', ')}`);
  if (numero === 2) {
    const commit = await correr(process.execPath, [
      join(RAIZ, 'tools', 'hooks', 'secretos.mjs'),
      ...archivos,
    ]);
    console.log('Intento de guardar el cambio (gancho de commit):');
    console.log(commit.errores.trim() || commit.salida.trim());
  }
  console.log('Corriendo la red…');
  rojo = await redRapida();
} finally {
  revertir();
}
const lineasRojas = desdeElVeredicto(rojo.salida);
console.log(lineasRojas.join('\n'));
console.log('Revertido.');
console.log('Corriendo la red de nuevo…');
const verde = await redRapida();
const lineasVerdes = desdeElVeredicto(verde.salida);
console.log(lineasVerdes.join('\n'));

const detecto =
  lineasRojas[0]?.startsWith('ROJO · ') && lineasRojas.join('\n').includes(sabotaje.espera);
const volvio = lineasVerdes[0]?.startsWith('VERDE · ');
if (!detecto) {
  console.log(`La red NO detectó el sabotaje nombrando «${sabotaje.espera}».`);
}
if (!volvio) {
  console.log('Al revertir, la red no volvió a VERDE.');
}
process.exitCode = detecto && volvio ? 0 : 1;
