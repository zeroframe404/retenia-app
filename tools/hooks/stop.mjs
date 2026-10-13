// Freno de cierre (gancho Stop de Claude Code, CA-007). Al terminar un turno: si el proyecto
// cambió desde la última corrida verde, corre «npm run verificar». Si da ROJO, frena el cierre
// con código 2 y manda el resumen por la salida de error, para que Claude siga trabajando.
// El segundo intento (stop_hook_active) pasa siempre, para no entrar en un círculo sin fin.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { huellaDelProyecto } from '../lib/archivos.mjs';
import { ARCHIVO_DE_CONTEO } from '../lib/fases.mjs';
import { leerEntrada } from '../lib/gancho.mjs';
import { correr, RAIZ } from '../lib/proceso.mjs';

const entrada = await leerEntrada();
if (entrada.stop_hook_active === true) {
  process.exit(0);
}

const ultimaVerde = join(RAIZ, '.cache', 'red', 'ultima-verde.json');
const huella = await huellaDelProyecto(RAIZ, [ARCHIVO_DE_CONTEO]);
if (existsSync(ultimaVerde)) {
  try {
    if (JSON.parse(readFileSync(ultimaVerde, 'utf8')).huella === huella) {
      process.exit(0);
    }
  } catch {
    // Si el archivo está dañado, se corre la red.
  }
}

const env = { ...process.env };
delete env.RETENIA_RED_DIR;
const r = await correr(process.execPath, [join(RAIZ, 'tools', 'verify.mjs')], {
  env,
  limiteMs: 600_000,
});
if (r.codigo === 0) {
  process.exit(0);
}
const renglones = r.salida.split(/\r?\n/);
const desde = renglones.findIndex((x) => x.startsWith('ROJO ·'));
const resumen = (desde === -1 ? renglones.slice(-40) : renglones.slice(desde)).join('\n').trim();
console.error(
  'Freno de cierre: la red quedó en ROJO después de tus cambios. No des la tarea por terminada: ' +
    'arreglá lo que sigue, corré «npm run verificar» hasta ver VERDE y recién después cerrá el turno.\n\n' +
    resumen,
);
process.exit(2);
