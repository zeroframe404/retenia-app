// «npm run tablero»: arma una página local en castellano con el estado del proyecto y la abre
// en el navegador. Por historia: sus criterios y el estado de sus pruebas; las tablas de casos
// con lo esperado y lo obtenido; y los lugares de cobertura, mutación, seguridad, accesibilidad
// y rendimiento. Nunca muestra nombres de archivos.
//   --salida <carpeta>   dónde dejarla (por defecto .cache/tablero)
//   --sin-abrir          no abre el navegador (la usan las pruebas)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { leerEspecificacionDelProyecto } from './lib/especificacion.mjs';
import { faseEnCurso, tagsDeFasesCerradas } from './lib/fases.mjs';
import { ESTADOS, expandirPlantillas, ultimosResultados } from './lib/historial.mjs';
import { listarTitulos } from './lib/listado.mjs';
import { RAIZ } from './lib/proceso.mjs';
import { ahora, formatearDuracion, formatearFechaHora } from './lib/reloj.mjs';
import { cruzar } from './lib/trazabilidad.mjs';

const salida = process.argv.includes('--salida')
  ? resolve(process.argv[process.argv.indexOf('--salida') + 1])
  : join(RAIZ, '.cache', 'tablero');
const abrir = !process.argv.includes('--sin-abrir');

function h(texto) {
  return String(texto)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function conCodigo(texto) {
  return h(texto).replace(/`([^`]+)`/g, '<code>$1</code>');
}

const especificacion = leerEspecificacionDelProyecto(RAIZ);
const [enCurso, tags, { titulos }] = await Promise.all([
  faseEnCurso(RAIZ),
  tagsDeFasesCerradas(RAIZ),
  listarTitulos(),
]);
const cerradas = tags.map((t) => t.numero);
const traza = cruzar({ especificacion, titulos, cerradas, enCurso, exigirEnCurso: false });
const { corridas, pruebas, cobertura } = ultimosResultados(RAIZ);
const criteriosPorId = new Map(
  traza.criterios.map((c) => [c.id, { ...c, pruebas: expandirPlantillas(c.pruebas, pruebas) }]),
);

function estadoDeCriterio(criterio) {
  if (criterio.pruebas.length === 0) {
    return { clase: 'sin', texto: 'Sin prueba' };
  }
  const estados = criterio.pruebas.map((p) => pruebas.get(p.titulo)?.estado ?? 'sin-correr');
  if (estados.includes('fallo')) {
    return { clase: 'falla', texto: 'Con fallas' };
  }
  if (estados.includes('salteada')) {
    return { clase: 'falla', texto: 'Con salteadas' };
  }
  if (estados.includes('sin-correr')) {
    return { clase: 'pendiente', texto: 'Faltan corridas' };
  }
  return { clase: 'bien', texto: 'Comprobado' };
}

function seccionDeCriterio(criterio) {
  const estado = estadoDeCriterio(criterio);
  const filas = criterio.pruebas
    .map(({ titulo, capa }) => {
      const ultimo = pruebas.get(titulo);
      const resultado = ESTADOS[ultimo?.estado ?? 'sin-correr'];
      const cuando = ultimo ? formatearFechaHora(new Date(ultimo.fecha)) : '—';
      return `<tr><td>${h(titulo)}</td><td>${h(capa)}</td><td><span class="chip ${ultimo?.estado ?? 'sin-correr'}">${h(resultado)}</span></td><td>${h(cuando)}</td></tr>`;
    })
    .join('');
  const tabla =
    criterio.pruebas.length === 0
      ? '<p class="nota">Todavía no tiene ninguna prueba.</p>'
      : `<table><thead><tr><th>Prueba</th><th>Capa</th><th>Resultado</th><th>Última vez</th></tr></thead><tbody>${filas}</tbody></table>`;
  return `<article class="criterio" aria-labelledby="t-${criterio.id}">
  <h4 id="t-${criterio.id}">${criterio.id} <span class="chip ${estado.clase}">${estado.texto}</span></h4>
  <p class="dado">Dado ${conCodigo(criterio.dado)}, cuando ${conCodigo(criterio.cuando)}, entonces ${conCodigo(criterio.entonces)}${/[.!?]$/.test(criterio.entonces ?? '') ? '' : '.'}</p>
  ${tabla}
</article>`;
}

function seccionDeFase(fase) {
  const cerrada = cerradas.includes(fase.numero);
  const actual = fase.numero === enCurso;
  const criterios = fase.criterios.map((id) => criteriosPorId.get(id)).filter(Boolean);
  const comprobados = criterios.filter((c) => estadoDeCriterio(c).clase === 'bien').length;
  const rotulo = cerrada ? 'cerrada' : actual ? 'en curso' : 'todavía no empezó';
  const resumen = `Fase ${fase.numero} · ${h(fase.nombre)} · ${rotulo} · ${comprobados} de ${criterios.length} criterios comprobados`;
  if (!cerrada && !actual) {
    return `<details class="fase"><summary>${resumen}</summary><p class="nota">Historias ${h(fase.historias.join(', '))}: ${criterios.map((c) => c.id).join(', ')}.</p></details>`;
  }
  const historias = especificacion.historias
    .filter((hist) => fase.historias.includes(hist.id))
    .map(
      (hist) => `<section class="historia" aria-labelledby="h-${hist.id}">
  <h3 id="h-${hist.id}">${hist.id} · ${h(hist.prioridad)}</h3>
  <p>${h(hist.descripcion)}</p>
  ${criterios
    .filter((c) => c.historia === hist.id)
    .map(seccionDeCriterio)
    .join('\n')}
</section>`,
    )
    .join('\n');
  return `<section class="fase abierta" aria-label="Fase ${fase.numero}"><h2>${resumen}</h2>${historias}</section>`;
}

function seccionDeCorridas() {
  const TOPES = { verificar: '2 min', 'verificar:todo': '15 min' };
  if (corridas.length === 0) {
    return '<p class="nota">Todavía no corrió la red. Corré «npm run verificar».</p>';
  }
  const filas = corridas
    .map((c) => {
      const linea = c.veredicto[0] ?? '';
      const resultado = linea.startsWith('ROJO')
        ? `${linea.split(' · ').slice(0, 2).join(' · ')} (el detalle está en la terminal)`
        : linea;
      return `<tr><td>npm run ${h(c.modo)}</td><td>${h(formatearFechaHora(new Date(c.fecha)))}</td><td>${h(resultado)}</td><td>${h(formatearDuracion(c.duracionMs))} (tope ${TOPES[c.modo]})</td></tr>`;
    })
    .join('');
  return `<table><thead><tr><th>Orden</th><th>Última corrida</th><th>Resultado</th><th>Tiempo</th></tr></thead><tbody>${filas}</tbody></table>`;
}

function capaDeLaUltima(id) {
  for (const corrida of [...corridas].reverse()) {
    const capa = corrida.capas.find((c) => c.id === id);
    if (capa) {
      return { ...capa, fecha: corrida.fecha };
    }
  }
  return null;
}

function renglonDeCapa(id, nombre, sinDatos) {
  const capa = capaDeLaUltima(id);
  if (!capa) {
    return `<li>${h(nombre)}: ${h(sinDatos)}</li>`;
  }
  const estado =
    capa.fallas === 0 ? 'sin faltas' : `${capa.fallas} ${capa.fallas === 1 ? 'falta' : 'faltas'}`;
  return `<li>${h(nombre)}: ${estado} (${h(formatearFechaHora(new Date(capa.fecha)))})</li>`;
}

function seccionDeCasos() {
  const tablas = new Map();
  for (const prueba of pruebas.values()) {
    if (prueba.caso) {
      if (!tablas.has(prueba.caso.tabla)) {
        tablas.set(prueba.caso.tabla, []);
      }
      tablas.get(prueba.caso.tabla).push(prueba);
    }
  }
  if (tablas.size === 0) {
    return '<p class="nota">Todavía no hay tablas de casos con resultados.</p>';
  }
  return [...tablas]
    .map(
      ([tabla, filas]) => `<h3>${h(tabla)}</h3>
<table><thead><tr><th>Entrada</th><th>Esperado</th><th>Obtenido</th><th>Resultado</th></tr></thead><tbody>
${filas
  .map(
    (p) =>
      `<tr><td>${h(p.caso.entrada)}</td><td>${h(p.caso.esperado)}</td><td>${h(p.caso.obtenido)}</td><td><span class="chip ${p.estado}">${h(ESTADOS[p.estado])}</span></td></tr>`,
  )
  .join('\n')}
</tbody></table>`,
    )
    .join('\n');
}

const pruebasDeAccesibilidad = [...pruebas.values()].filter((p) =>
  p.titulo.startsWith('accesibilidad:'),
);
const coma = (n) => String(n).replace('.', ',');

const html = `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tablero de Retenia</title>
<style>
:root { color-scheme: light dark; --fondo:#f7f6f2; --tinta:#1d1d1b; --suave:#5d5a52; --borde:#d9d4c4; --tarjeta:#ffffff;
  --bien:#1f6b45; --bien-fondo:#dcefe3; --falla:#7a4a00; --falla-fondo:#f6e3bf; --pend:#2f4f7a; --pend-fondo:#dfe7f3; --sin:#4a4a4a; --sin-fondo:#e6e4de; }
@media (prefers-color-scheme: dark) { :root { --fondo:#16171a; --tinta:#ecebe6; --suave:#b5b1a6; --borde:#3a3a3d; --tarjeta:#1f2024;
  --bien:#9fdcb9; --bien-fondo:#1f3a2c; --falla:#f3cf8f; --falla-fondo:#4a3712; --pend:#b9cdf0; --pend-fondo:#24334b; --sin:#d0cec8; --sin-fondo:#33332f; } }
body { margin:0; background:var(--fondo); color:var(--tinta); font-family:"Segoe UI",system-ui,sans-serif; line-height:1.45; }
main { max-width:1100px; margin:0 auto; padding:1.5rem 1rem 4rem; }
h1 { margin:0 0 .25rem; } h2 { margin-top:2rem; font-size:1.2rem; } h3 { margin-bottom:.25rem; }
.nota { color:var(--suave); }
table { width:100%; border-collapse:collapse; margin:.5rem 0 1rem; background:var(--tarjeta); }
th, td { text-align:left; padding:.35rem .5rem; border-bottom:1px solid var(--borde); vertical-align:top; }
.criterio { border:1px solid var(--borde); border-radius:8px; padding:.25rem 1rem; margin:.75rem 0; background:var(--tarjeta); }
.chip { display:inline-block; padding:.05rem .5rem; border-radius:999px; font-size:.85rem; font-weight:600; }
.bien, .paso { color:var(--bien); background:var(--bien-fondo); }
.falla, .fallo, .salteada { color:var(--falla); background:var(--falla-fondo); }
.pendiente, .sin-correr { color:var(--pend); background:var(--pend-fondo); }
.sin { color:var(--sin); background:var(--sin-fondo); }
details.fase { margin:.5rem 0; } summary { cursor:pointer; }
code { font-family:Consolas,monospace; }
</style>
</head>
<body>
<main>
<h1>Tablero de Retenia</h1>
<p class="nota">Armado el ${h(formatearFechaHora(ahora()))}, hora de Buenos Aires. ${enCurso ? `Fase en curso: ${enCurso}.` : ''} Fases cerradas: ${cerradas.length === 0 ? 'ninguna todavía' : cerradas.join(', ')}.</p>

<section aria-labelledby="s-red"><h2 id="s-red">Estado de la red</h2>${seccionDeCorridas()}</section>

<section aria-labelledby="s-historias"><h2 id="s-historias">Historias, criterios y pruebas</h2>
<p class="nota">${traza.numerador} de ${traza.denominador} criterios de las fases cerradas y en curso tienen al menos una prueba.</p>
${especificacion.fases.map(seccionDeFase).join('\n')}
</section>

<section aria-labelledby="s-casos"><h2 id="s-casos">Tablas de casos: lo esperado y lo obtenido</h2>${seccionDeCasos()}</section>

<section aria-labelledby="s-cobertura"><h2 id="s-cobertura">Cobertura de reglas</h2>
${cobertura ? `<p>Las pruebas recorren el ${coma(cobertura.ramas)} % de las ramas y el ${coma(cobertura.lineas)} % de las líneas del núcleo (las reglas puras). Mínimo de ramas: ${cobertura.umbral} %.</p>` : '<p class="nota">Todavía sin medir: corré «npm run verificar».</p>'}
</section>

<section aria-labelledby="s-mutacion"><h2 id="s-mutacion">Mutación</h2>
<p class="nota">Todavía sin medir. Acá va a aparecer, por módulo del núcleo, qué parte de las roturas a propósito detecta la red.</p>
</section>

<section aria-labelledby="s-seguridad"><h2 id="s-seguridad">Seguridad</h2><ul>
${renglonDeCapa('secretos', 'Escáner de secretos', 'todavía no corrió')}
${renglonDeCapa('auditoria', 'Auditoría de dependencias (vulnerabilidades altas o críticas)', 'corre con «npm run verificar:todo»')}
${renglonDeCapa('seguridad', 'Análisis estático de seguridad', 'corre con «npm run verificar:todo»')}
${renglonDeCapa('capas', 'Regla de capas', 'todavía no corrió')}
</ul></section>

<section aria-labelledby="s-accesibilidad"><h2 id="s-accesibilidad">Accesibilidad</h2><ul>
${renglonDeCapa('accesibilidad', 'Revisión automática de la ventana', 'corre con «npm run verificar:todo»')}
<li>Pantallas revisadas: ${pruebasDeAccesibilidad.length}.</li>
</ul></section>

<section aria-labelledby="s-rendimiento"><h2 id="s-rendimiento">Rendimiento</h2>
<p class="nota">Todavía sin medir. Acá van a aparecer el arranque, la siguiente tarjeta, abrir Estudiar y buscar, con sus topes.</p>
</section>
</main>
</body>
</html>
`;

mkdirSync(salida, { recursive: true });
const pagina = join(salida, 'index.html');
writeFileSync(pagina, html);
console.log(`Tablero listo: ${pagina}`);
if (abrir) {
  spawn('explorer.exe', [pagina], { detached: true, stdio: 'ignore' }).unref();
  console.log('Se abre en tu navegador.');
}
