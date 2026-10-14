// La red de pruebas de Retenia.
//   node tools/verify.mjs          → «npm run verificar» (rápida)
//   node tools/verify.mjs --todo   → «npm run verificar:todo» (todo, con punta a punta)
// Corre cada capa, junta los resultados y termina siempre con una línea de veredicto:
// «VERDE · …» o «ROJO · … · copiá desde acá hasta el final y pegáselo a Claude Code»,
// y debajo del rojo, el resumen de fallas en castellano.
//
// Este archivo solo importa veredicto.mjs, que no depende de nada. El resto se carga adentro
// del try: si algo no carga (por ejemplo, el reloj escrito con TypeScript que Node no sabe
// leer), igual sale la línea ROJO con el motivo.
import { startupFailure } from './lib/veredicto.mjs';

try {
  const { runNetwork } = await import('./lib/red.mjs');
  process.exitCode = await runNetwork({ full: process.argv.includes('--todo') });
} catch (error) {
  console.log('');
  for (const line of startupFailure(error)) {
    console.log(line);
  }
  process.exitCode = 1;
}
