// La red de pruebas de Retenia.
//   node tools/verify.mjs          → «npm run verificar» (rápida)
//   node tools/verify.mjs --todo   → «npm run verificar:todo» (todo, con punta a punta)
// Corre cada capa, junta los resultados y termina siempre con una línea de veredicto:
// «VERDE · …» o «ROJO · … · copiá desde acá hasta el final y pegáselo a Claude Code»,
// y debajo del rojo, el resumen de fallas en castellano.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { archivosDelProyecto, huellaDelProyecto } from './lib/archivos.mjs';
import { leerEspecificacionDelProyecto } from './lib/especificacion.mjs';
import { ARCHIVO_DE_CONTEO, conteoEnTag, faseEnCurso, tagsDeFasesCerradas } from './lib/fases.mjs';
import { listarTitulos } from './lib/listado.mjs';
import { correr, correrPaquete, jsonDe, RAIZ, rutaDeNpm, sinColores } from './lib/proceso.mjs';
import { ahora, cronometro, formatearDuracion } from './lib/reloj.mjs';
import { leerInformeDePlaywright, leerInformeDeVitest } from './lib/resultados.mjs';
import { cruzar } from './lib/trazabilidad.mjs';
import {
  armarVeredicto,
  buscarMarcas,
  comparacionConTag,
  lineaRoja,
  problemaDeSalteadas,
} from './lib/veredicto.mjs';

const TODO = process.argv.includes('--todo');
const MODO = TODO ? 'verificar:todo' : 'verificar';
// Una corrida con RETENIA_RED_DIR es aislada: escribe solo ahí (la usan las pruebas de la red).
const AISLADA = Boolean(process.env.RETENIA_RED_DIR);
const CORRIDA = resolve(
  process.env.RETENIA_RED_DIR ?? join(RAIZ, '.cache', 'red', 'corridas', TODO ? 'todo' : 'rapida'),
);
const REGISTROS = join(CORRIDA, 'registros');
const UMBRAL_RAMAS_NUCLEO = 90;
const CAPAS_RAPIDAS = ['unitarias', 'propiedades', 'contrato', 'integracion', 'estaticas'];
const ENV_DE_PRUEBA = { ...process.env, RETENIA_RED_DIR: CORRIDA };

mkdirSync(REGISTROS, { recursive: true });

function guardarRegistro(nombre, resultado) {
  writeFileSync(
    join(REGISTROS, `${nombre}.txt`),
    `código de salida: ${resultado.codigo}\n\n--- salida ---\n${resultado.salida}\n--- errores ---\n${resultado.errores}\n`,
  );
}

function borrar(ruta) {
  rmSync(ruta, { recursive: true, force: true });
}

function rel(ruta) {
  return relative(RAIZ, ruta).split('\\').join('/');
}

function primerRenglon(texto) {
  return (
    sinColores(texto ?? '')
      .split(/\r?\n/)
      .find((r) => r.trim() !== '')
      ?.trim() ?? ''
  );
}

function fallaGeneral(nombre, r) {
  if (r.vencido) {
    return `${nombre} tardó demasiado y la corté. Mirá ${rel(join(REGISTROS, `${nombre}.txt`))}.`;
  }
  return `${nombre} terminó con error: ${primerRenglon(r.errores) || primerRenglon(r.salida) || `código ${r.codigo}`}. Mirá el registro completo.`;
}

// ---------- Capas ----------

async function capaFormato() {
  const r = await correrPaquete('@biomejs/biome', 'biome', [
    'ci',
    '--reporter=json',
    '--colors=off',
    '--error-on-warnings',
    '.',
  ]);
  guardarRegistro('formato-y-linter', r);
  if (r.codigo === 0) {
    return [];
  }
  let informe = null;
  try {
    informe = jsonDe(r.salida);
  } catch {
    informe = null;
  }
  const diagnosticos = informe?.diagnostics ?? [];
  if (diagnosticos.length === 0) {
    return [fallaGeneral('formato-y-linter', r)];
  }
  return diagnosticos.map((d) => {
    const ruta = (d.location?.path ?? '').split('\\').join('/');
    const renglon = d.location?.start?.line ? `:${d.location.start.line}` : '';
    if (d.category === 'format') {
      return `${ruta} no tiene el formato acordado (se arregla con «npx biome check --write ${ruta}»).`;
    }
    return `${ruta}${renglon}: ${d.message} (${d.category}).`;
  });
}

async function capaTipos() {
  const configuraciones = ['tsconfig.json', 'tsconfig.web.json', 'tsconfig.e2e.json'];
  const corridas = await Promise.all(
    configuraciones.map((c) =>
      correrPaquete('typescript', 'tsc', ['-p', c, '--noEmit', '--pretty', 'false']),
    ),
  );
  const problemas = [];
  corridas.forEach((r, i) => {
    guardarRegistro(`tipos-${configuraciones[i]}`, r);
    if (r.codigo === 0) {
      return;
    }
    const errores = [
      ...`${r.salida}\n${r.errores}`.matchAll(/^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/gm),
    ];
    if (errores.length === 0) {
      problemas.push(fallaGeneral(`tipos-${configuraciones[i]}`, r));
    }
    for (const [, archivo, renglon, codigo, mensaje] of errores) {
      problemas.push(`${archivo.split('\\').join('/')}:${renglon}: ${mensaje} (${codigo}).`);
    }
  });
  return problemas;
}

async function capaCapas() {
  const r = await correrPaquete('dependency-cruiser', 'depcruise', [
    'src',
    '--config',
    '.dependency-cruiser.cjs',
    '--output-type',
    'json',
  ]);
  guardarRegistro('capas', r);
  let informe = null;
  try {
    informe = jsonDe(r.salida);
  } catch {
    informe = null;
  }
  if (!informe) {
    return [fallaGeneral('capas', r)];
  }
  const comentarios = new Map(
    (informe.summary.ruleSetUsed?.forbidden ?? []).map((regla) => [regla.name, regla.comment]),
  );
  return informe.summary.violations.map(
    (v) =>
      `capas: «${v.from}» importa «${v.to}». ${comentarios.get(v.rule.name) ?? ''} (regla ${v.rule.name}).`,
  );
}

async function capaCodigoMuerto() {
  const r = await correrPaquete('knip', 'knip', ['--reporter', 'json', '--no-progress']);
  guardarRegistro('codigo-muerto', r);
  if (r.codigo === 0) {
    return [];
  }
  let informe = null;
  try {
    informe = jsonDe(r.salida);
  } catch {
    informe = null;
  }
  if (!informe) {
    return [fallaGeneral('codigo-muerto', r)];
  }
  const QUE = {
    files: 'archivo que nadie usa',
    dependencies: 'dependencia que nadie usa',
    devDependencies: 'dependencia de desarrollo que nadie usa',
    optionalPeerDependencies: 'dependencia opcional que nadie usa',
    unlisted: 'paquete usado que no está en package.json',
    binaries: 'programa usado que no está en package.json',
    unresolved: 'importación que no se encuentra',
    exports: 'exportación que nadie usa',
    nsExports: 'exportación que nadie usa',
    types: 'tipo exportado que nadie usa',
    nsTypes: 'tipo exportado que nadie usa',
    enumMembers: 'valor de enumeración que nadie usa',
    classMembers: 'miembro de clase que nadie usa',
    duplicates: 'exportación duplicada',
  };
  const problemas = (informe.files ?? []).map((f) => `${f}: ${QUE.files}.`);
  for (const issue of informe.issues ?? []) {
    for (const [tipo, lista] of Object.entries(issue)) {
      if (!Array.isArray(lista) || !(tipo in QUE) || (tipo === 'files' && lista.length === 0)) {
        continue;
      }
      for (const item of lista) {
        const nombre = Array.isArray(item) ? item.map((x) => x.name).join(', ') : item.name;
        const renglon = item.line ? `:${item.line}` : '';
        problemas.push(`${issue.file}${renglon}: ${QUE[tipo]} («${nombre}»).`);
      }
    }
  }
  return problemas.length > 0 ? problemas : [fallaGeneral('codigo-muerto', r)];
}

const BINARIOS = /\.(png|jpe?g|gif|ico|exe|dll|pdf|zip|woff2?|ttf|db|onnx)$/i;

async function capaSecretos() {
  const archivos = (await archivosDelProyecto(RAIZ)).filter((a) => !BINARIOS.test(a));
  const problemas = [];
  for (let i = 0; i < archivos.length; i += 80) {
    const tanda = archivos.slice(i, i + 80);
    const r = await correrPaquete('secretlint', 'secretlint', [
      '--format',
      'json',
      '--no-color',
      ...tanda,
    ]);
    guardarRegistro(`secretos-${i / 80 + 1}`, {
      ...r,
      salida: '(informe omitido: puede tener contenido de archivos)',
    });
    if (r.codigo === 0) {
      continue;
    }
    let informe = null;
    try {
      informe = jsonDe(r.salida);
    } catch {
      informe = null;
    }
    if (!informe) {
      problemas.push(fallaGeneral('secretos', r));
      continue;
    }
    for (const archivo of informe) {
      for (const m of archivo.messages ?? []) {
        const regla = String(m.ruleId ?? '').replace('@secretlint/secretlint-rule-', '');
        problemas.push(
          `posible secreto en ${rel(archivo.filePath)}:${m.loc?.start?.line ?? '?'} (${regla}). Un secreto nunca va en el repositorio: la clave de IA vive solo en el almacén seguro de Windows.`,
        );
      }
    }
  }
  return problemas;
}

async function capaMarcas() {
  const archivos = (await archivosDelProyecto(RAIZ)).filter((a) =>
    /^tests\/.+\.(test|spec)\.ts$/.test(a),
  );
  const marcas = [];
  for (const archivo of archivos) {
    for (const m of buscarMarcas(readFileSync(join(RAIZ, archivo), 'utf8'))) {
      marcas.push({ ...m, archivo });
    }
  }
  return marcas;
}

async function correrVitest(proyectos, nombre) {
  const informe = join(CORRIDA, `${nombre}.json`);
  const cobertura = join(CORRIDA, `cobertura-${nombre}`);
  borrar(informe);
  borrar(cobertura);
  const r = await correrPaquete(
    'vitest',
    'vitest',
    [
      'run',
      ...proyectos.flatMap((p) => ['--project', p]),
      '--reporter=json',
      `--outputFile=${informe}`,
      ...(nombre === 'pruebas'
        ? ['--coverage.enabled', `--coverage.reportsDirectory=${cobertura}`]
        : []),
    ],
    { env: ENV_DE_PRUEBA, limiteMs: nombre === 'pruebas' ? 300_000 : 900_000 },
  );
  guardarRegistro(nombre, r);
  const leido = leerInformeDeVitest(informe);
  return { r, leido, cobertura };
}

async function listarTodo() {
  const { titulos, errores, crudos } = await listarTitulos({ env: ENV_DE_PRUEBA });
  guardarRegistro('listado-vitest', crudos.vitest);
  guardarRegistro('listado-punta-a-punta', crudos.puntaAPunta);
  return { titulos, problemas: errores.map((e) => fallaGeneral(e.nombre, e.r)) };
}

async function capaCompilar() {
  const r = await correrPaquete('electron-vite', 'electron-vite', ['build'], {
    env: { ...process.env, RETENIA_VARIANTE: 'prueba' },
    limiteMs: 300_000,
  });
  guardarRegistro('compilar', r);
  return r.codigo === 0 ? [] : [fallaGeneral('compilar', r)];
}

async function correrPuntaAPunta() {
  const informe = join(CORRIDA, 'punta-a-punta', 'informe.json');
  borrar(informe);
  const r = await correrPaquete('@playwright/test', 'playwright', ['test'], {
    env: ENV_DE_PRUEBA,
    limiteMs: 600_000,
  });
  guardarRegistro('punta-a-punta', r);
  return { r, leido: leerInformeDePlaywright(informe) };
}

async function capaAuditoria() {
  const r = await correr(process.execPath, [rutaDeNpm(), 'audit', '--json'], {
    limiteMs: 180_000,
  });
  guardarRegistro('auditoria', r);
  let informe = null;
  try {
    informe = jsonDe(r.salida);
  } catch {
    informe = null;
  }
  const v = informe?.metadata?.vulnerabilities;
  if (!v) {
    return [
      `no pude consultar la auditoría de dependencias (¿sin internet?): ${primerRenglon(r.errores) || primerRenglon(r.salida)}.`,
    ];
  }
  const graves = (v.high ?? 0) + (v.critical ?? 0);
  if (graves === 0) {
    return [];
  }
  const nombres = Object.entries(informe.vulnerabilities ?? {})
    .filter(([, d]) => d.severity === 'high' || d.severity === 'critical')
    .map(([nombre, d]) => `${nombre} (${d.severity === 'critical' ? 'crítica' : 'alta'})`);
  return [
    `hay ${graves} vulnerabilidades altas o críticas en las dependencias: ${nombres.join(', ')}.`,
  ];
}

async function capaSeguridadEstatica() {
  const exe = join(RAIZ, 'tools', 'bin', 'opengrep.exe');
  if (!existsSync(exe)) {
    const p = await correr(process.execPath, [join(RAIZ, 'tools', 'preparar.mjs')], {
      limiteMs: 300_000,
    });
    guardarRegistro('preparar', p);
    if (p.codigo !== 0 || !existsSync(exe)) {
      return [`no pude preparar Opengrep: ${primerRenglon(p.errores) || primerRenglon(p.salida)}.`];
    }
  }
  const r = await correr(
    exe,
    ['scan', '--config', 'tools/opengrep/reglas.yml', '--json', '--quiet', 'src', 'tools'],
    { limiteMs: 300_000 },
  );
  guardarRegistro('seguridad-estatica', r);
  let informe = null;
  try {
    informe = jsonDe(r.salida);
  } catch {
    informe = null;
  }
  if (!informe || !Array.isArray(informe.results)) {
    return [fallaGeneral('seguridad-estatica', r)];
  }
  const problemas = informe.results.map(
    (h) => `${h.path.split('\\').join('/')}:${h.start?.line}: ${h.extra?.message ?? h.check_id}`,
  );
  for (const e of informe.errors ?? []) {
    problemas.push(`Opengrep no pudo analizar algo: ${primerRenglon(e.message ?? String(e))}`);
  }
  return problemas;
}

// ---------- Armado ----------

function traducirFallo(prueba) {
  const mensaje = sinColores(prueba.mensajes[0] ?? '');
  const esperado =
    /expected (.+?) to (?:be|equal|deeply equal|strictly equal|contain|match) (.+?)(?:\s*\/\/.*)?$/m.exec(
      mensaje,
    );
  const detalle = esperado
    ? `Esperaba ${esperado[2]} y dio ${esperado[1]}.`
    : primerRenglon(mensaje).slice(0, 300);
  const ubicacion = /(tests[\\/][^\s:()]+:\d+)/.exec(mensaje)?.[1]?.split('\\').join('/');
  return `falló «${prueba.titulo}» (${prueba.capa}). ${detalle}${ubicacion ? ` (${ubicacion})` : ''}`;
}

function problemasDePruebas(nombre, { r, leido }) {
  if (!leido) {
    return { pruebas: [], problemas: [{ capa: 'Pruebas', texto: fallaGeneral(nombre, r) }] };
  }
  const problemas = [];
  for (const roto of leido.archivosRotos) {
    problemas.push({
      capa: 'Pruebas',
      texto: `no se pudo cargar ${roto.archivo ? rel(roto.archivo) : 'un archivo de pruebas'}: ${primerRenglon(roto.mensaje)}`,
    });
  }
  for (const prueba of leido.pruebas.filter((p) => p.estado === 'fallo')) {
    problemas.push({ capa: 'Pruebas', texto: traducirFallo(prueba) });
  }
  if (r.vencido) {
    problemas.push({ capa: 'Pruebas', texto: fallaGeneral(nombre, r) });
  } else if (
    r.codigo !== 0 &&
    problemas.length === 0 &&
    leido.pruebas.every((p) => p.estado !== 'salteada')
  ) {
    problemas.push({ capa: 'Pruebas', texto: fallaGeneral(nombre, r) });
  }
  return { pruebas: leido.pruebas, problemas };
}

const capas = [];

async function capa(id, nombre, trabajo) {
  const medir = cronometro();
  const resultado = await trabajo();
  const lista = Array.isArray(resultado) ? resultado : resultado.problemas;
  const problemas = lista.map((p) => (typeof p === 'string' ? { capa: nombre, texto: p } : p));
  const registro = { id, nombre, problemas, duracionMs: medir() };
  capas.push(registro);
  const peso = problemas.reduce((s, p) => s + (p.peso ?? 1), 0);
  const estado = peso === 0 ? 'bien' : `${peso} ${peso === 1 ? 'falla' : 'fallas'}`;
  console.log(
    `  ${`${nombre} `.padEnd(34, '.')} ${estado} (${formatearDuracion(registro.duracionMs)})`,
  );
  return resultado;
}

async function principal() {
  const medirTodo = cronometro();
  const inicio = ahora();
  const huella = await huellaDelProyecto(RAIZ, [ARCHIVO_DE_CONTEO]);
  console.log(`Red de Retenia · ${MODO}${TODO ? ' (todo, con punta a punta)' : ' (rápida)'}`);

  const especificacion = leerEspecificacionDelProyecto(RAIZ);
  const [enCurso, tags] = await Promise.all([faseEnCurso(RAIZ), tagsDeFasesCerradas(RAIZ)]);

  let pruebasRapidas = [];
  let coberturaDir = null;
  let titulos = [];
  let marcas = [];

  const rapidas = [
    capa('formato', 'Formato y linter', capaFormato),
    capa('tipos', 'Tipos', capaTipos),
    capa('capas', 'Capas', capaCapas),
    capa('codigo-muerto', 'Código muerto', capaCodigoMuerto),
    capa('secretos', 'Escáner de secretos', capaSecretos),
    capa('pruebas', 'Pruebas unitarias y de integración', async () => {
      const v = await correrVitest(CAPAS_RAPIDAS, 'pruebas');
      coberturaDir = v.cobertura;
      const { pruebas, problemas } = problemasDePruebas('pruebas', v);
      pruebasRapidas = pruebas;
      return problemas;
    }),
    (async () => {
      const listado = await listarTodo();
      titulos = listado.titulos;
      marcas = await capaMarcas();
      return listado;
    })(),
  ];
  const compilar = TODO ? capa('compilar', 'Compilar la variante de prueba', capaCompilar) : null;
  const [, , , , , , listado] = await Promise.all(rapidas);
  await compilar;

  let pruebasTodo = [];
  if (TODO) {
    const compilo = capas.find((c) => c.id === 'compilar')?.problemas.length === 0;
    let e2e = { pruebas: [], problemas: [] };
    await Promise.all([
      capa('punta-a-punta', 'Punta a punta (ventana real)', async () => {
        if (!compilo) {
          return ['no corrió porque no se pudo compilar la variante de prueba.'];
        }
        e2e = problemasDePruebas('punta-a-punta', await correrPuntaAPunta());
        return e2e.problemas.filter((p) => !p.texto.includes('accesibilidad:'));
      }),
      capa('auditoria', 'Auditoría de dependencias', capaAuditoria),
      capa('seguridad', 'Análisis estático de seguridad', capaSeguridadEstatica),
    ]);
    await capa('accesibilidad', 'Accesibilidad', async () => {
      const deAccesibilidad = e2e.pruebas.filter((p) => p.titulo.startsWith('accesibilidad:'));
      if (compilo && deAccesibilidad.length === 0) {
        return ['no encontré ninguna prueba de accesibilidad en la punta a punta.'];
      }
      return e2e.problemas.filter((p) => p.texto.includes('accesibilidad:'));
    });
    await capa('red', 'Red completa y sabotajes', async () => {
      const v = await correrVitest(['red'], 'red');
      const { pruebas, problemas } = problemasDePruebas('red', v);
      pruebasTodo = [...e2e.pruebas, ...pruebas];
      return problemas;
    });
  }

  const pruebas = [...pruebasRapidas, ...pruebasTodo];

  // Salteadas: las que el corredor salteó, más las marcadas en archivos que no corrieron.
  const salteadas = pruebas.filter((p) => p.estado === 'salteada');
  const archivosCorridos = new Set(pruebas.map((p) => rel(resolve(RAIZ, p.archivo))));
  const marcasSinCorrer = marcas.filter(
    (m) => m.tipo === 'skip' && !archivosCorridos.has(m.archivo),
  );
  const totalSalteadas = salteadas.length + marcasSinCorrer.length;
  await capa('salteadas', 'Pruebas salteadas o solas', async () => {
    const problemas = [];
    const aviso = problemaDeSalteadas(salteadas, marcasSinCorrer);
    if (aviso) {
      problemas.push(aviso);
    }
    for (const m of marcas.filter((x) => x.tipo === 'only')) {
      problemas.push({
        capa: 'Salteadas',
        texto: `${m.archivo}:${m.renglon} tiene «${m.marca}»: hace correr solo esa prueba y esconde las demás. Sacala.`,
      });
    }
    return problemas;
  });

  const traza = cruzar({
    especificacion,
    titulos,
    cerradas: tags.map((t) => t.numero),
    enCurso,
    exigirEnCurso: TODO,
  });
  await capa('trazabilidad', 'Trazabilidad de criterios', async () => [
    ...listado.problemas,
    ...traza.problemas,
  ]);

  let cobertura = null;
  await capa('cobertura', 'Cobertura de ramas del núcleo', async () => {
    const resumen = coberturaDir && join(coberturaDir, 'coverage-summary.json');
    if (!resumen || !existsSync(resumen)) {
      return [];
    }
    const total = JSON.parse(readFileSync(resumen, 'utf8')).total;
    cobertura = { ramas: total.branches.pct, lineas: total.lines.pct, umbral: UMBRAL_RAMAS_NUCLEO };
    return total.branches.pct < UMBRAL_RAMAS_NUCLEO
      ? [
          `las pruebas recorren el ${total.branches.pct} % de las ramas de src/core y el mínimo es ${UMBRAL_RAMAS_NUCLEO} %.`,
        ]
      : [];
  });

  // La cantidad de pruebas no baja respecto del último tag fase-NN-ok.
  const corridas = pruebas.filter((p) => p.estado !== 'salteada').length;
  await capa('cantidad', 'Cantidad de pruebas', async () => {
    const ultimoTag = tags.at(-1);
    if (!ultimoTag) {
      return [];
    }
    const enTag = await conteoEnTag(RAIZ, ultimoTag.tag);
    const aviso = comparacionConTag({ actual: corridas, enTag: enTag?.[MODO], tag: ultimoTag.tag });
    return aviso ? [aviso] : [];
  });

  const problemas = capas.flatMap((c) => c.problemas);
  const duracionMs = medirTodo();
  console.log(`  Tiempo total: ${formatearDuracion(duracionMs)}`);
  const veredicto = armarVeredicto({
    problemas,
    cuentas: {
      corridas,
      fallaron: pruebas.filter((p) => p.estado === 'fallo').length,
      salteadas: totalSalteadas,
      cubiertos: traza.numerador,
      criterios: traza.denominador,
    },
    registros: rel(REGISTROS) || REGISTROS,
  });

  const resultado = {
    modo: MODO,
    fecha: inicio.toISOString(),
    duracionMs,
    faseEnCurso: enCurso,
    fasesCerradas: tags.map((t) => t.numero),
    capas: capas.map(({ id, nombre, problemas: p, duracionMs: d }) => ({
      id,
      nombre,
      fallas: p.reduce((s, x) => s + (x.peso ?? 1), 0),
      duracionMs: d,
    })),
    pruebas,
    trazabilidad: {
      numerador: traza.numerador,
      denominador: traza.denominador,
      criterios: traza.criterios.map((c) => ({ id: c.id, fase: c.fase, pruebas: c.pruebas })),
    },
    cobertura,
    veredicto: veredicto.lineas,
  };
  writeFileSync(join(CORRIDA, 'resultado.json'), `${JSON.stringify(resultado, null, 2)}\n`);

  if (!AISLADA) {
    const ultimo = join(RAIZ, '.cache', 'red', 'ultimo');
    mkdirSync(ultimo, { recursive: true });
    writeFileSync(join(ultimo, TODO ? 'todo.json' : 'rapida.json'), JSON.stringify(resultado));
    if (veredicto.verde) {
      writeFileSync(
        join(RAIZ, '.cache', 'red', 'ultima-verde.json'),
        JSON.stringify({ huella, fecha: inicio.toISOString(), modo: MODO }),
      );
      const rutaConteo = join(RAIZ, ARCHIVO_DE_CONTEO);
      const conteo = existsSync(rutaConteo) ? JSON.parse(readFileSync(rutaConteo, 'utf8')) : {};
      if (conteo[MODO] !== corridas) {
        conteo[MODO] = corridas;
        writeFileSync(rutaConteo, `${JSON.stringify(conteo, null, 2)}\n`);
      }
    }
  }

  console.log('');
  for (const linea of veredicto.lineas) {
    console.log(linea);
  }
  process.exitCode = veredicto.verde ? 0 : 1;
}

principal().catch((error) => {
  console.log('');
  console.log(lineaRoja(1));
  console.log('Resumen de fallas:');
  console.log(`1. La red misma: se cortó con un error inesperado: ${error?.stack ?? error}`);
  process.exitCode = 1;
});
