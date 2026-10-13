// «npm run trazabilidad [-- --fase NN]»: por cada criterio de la fase (la en curso si no se
// dice), sus pruebas y el último resultado de cada una.
import { leerEspecificacionDelProyecto } from './lib/especificacion.mjs';
import { faseEnCurso, tagsDeFasesCerradas } from './lib/fases.mjs';
import { ESTADOS, ultimosResultados } from './lib/historial.mjs';
import { listarTitulos } from './lib/listado.mjs';
import { RAIZ } from './lib/proceso.mjs';
import { formatearFechaHora } from './lib/reloj.mjs';
import { cruzar } from './lib/trazabilidad.mjs';

const pedida = process.argv[process.argv.indexOf('--fase') + 1];
const enCurso = await faseEnCurso(RAIZ);
const numero = process.argv.includes('--fase') ? pedida?.padStart(2, '0') : enCurso;
const especificacion = leerEspecificacionDelProyecto(RAIZ);
const fase = especificacion.fases.find((f) => f.numero === numero);
if (!fase) {
  console.log('Decime qué fase: npm run trazabilidad -- --fase 02');
  process.exit(1);
}

const [{ titulos }, tags] = await Promise.all([listarTitulos(), tagsDeFasesCerradas(RAIZ)]);
const traza = cruzar({
  especificacion,
  titulos,
  cerradas: tags.map((t) => t.numero),
  enCurso,
  exigirEnCurso: false,
});
const { pruebas } = ultimosResultados(RAIZ);

console.log(`Trazabilidad · Fase ${fase.numero} · ${fase.nombre} (${fase.historias.join(', ')})`);
let cubiertos = 0;
for (const criterio of traza.criterios.filter((c) => c.fase === fase.numero)) {
  console.log('');
  console.log(`${criterio.id} · ${criterio.entonces}`);
  if (criterio.pruebas.length === 0) {
    console.log('   Sin prueba todavía.');
    continue;
  }
  cubiertos++;
  for (const { titulo, capa } of criterio.pruebas) {
    const ultimo = pruebas.get(titulo);
    const estado = ultimo
      ? `${ESTADOS[ultimo.estado]} (${formatearFechaHora(new Date(ultimo.fecha))})`
      : ESTADOS['sin-correr'];
    console.log(`   ${estado.padEnd(28)} ${capa} · ${titulo}`);
  }
}
console.log('');
console.log(
  `${cubiertos} de ${fase.criterios.length} criterios de la fase con al menos una prueba.`,
);
