import { existsSync, readFileSync } from 'node:fs';

const CAPAS = {
  unitarias: 'Unitaria',
  propiedades: 'Propiedades',
  contrato: 'Contrato del puente',
  integracion: 'Integración',
  estaticas: 'Estática',
  red: 'Red completa y sabotajes',
  e2e: 'Punta a punta',
};

export function capaDeArchivo(archivo) {
  const carpeta = /(?:^|[\\/])tests[\\/]([^\\/]+)[\\/]/.exec(archivo)?.[1];
  return CAPAS[carpeta] ?? 'Otra';
}

const ID_AL_PRINCIPIO = /^((?:\[CA-\d{3}\]\s*)+)/;

// Los criterios que nombra una prueba: los identificadores entre corchetes al principio.
/** @param {string} titulo @returns {string[]} */
export function criteriosDelTitulo(titulo) {
  const prefijo = ID_AL_PRINCIPIO.exec(titulo)?.[1] ?? '';
  return [...prefijo.matchAll(/CA-\d{3}/g)].map((m) => m[0]);
}

// Una prueba que menciona un criterio pero no lo pone al principio entre corchetes.
export function tituloMalFormado(titulo) {
  return /CA-\d{3}/.test(titulo) && criteriosDelTitulo(titulo).length === 0;
}

function leerJson(ruta) {
  return existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : null;
}

const ESTADO_VITEST = {
  passed: 'paso',
  failed: 'fallo',
  skipped: 'salteada',
  pending: 'salteada',
  todo: 'salteada',
};

/**
 * @typedef {{ tabla: string, entrada: string, esperado: string, obtenido: string }} Caso
 * @typedef {{ titulo: string, archivo: string, capa: string, estado: 'paso' | 'fallo' | 'salteada', mensajes: string[], caso: Caso | null, duracionMs: number }} Prueba
 * @typedef {{ pruebas: Prueba[], archivosRotos: { archivo: string, mensaje: string }[] }} Informe
 */

// Informe JSON de Vitest → pruebas normalizadas, más los archivos que no se pudieron cargar.
/** @param {string} ruta @returns {Informe | null} */
export function leerInformeDeVitest(ruta) {
  const informe = leerJson(ruta);
  if (!informe) {
    return null;
  }
  const pruebas = [];
  const archivosRotos = [];
  for (const archivo of informe.testResults ?? []) {
    if (archivo.status === 'failed' && (archivo.assertionResults ?? []).length === 0) {
      archivosRotos.push({ archivo: archivo.name, mensaje: archivo.message ?? '' });
    }
    for (const prueba of archivo.assertionResults ?? []) {
      pruebas.push({
        titulo: prueba.title,
        archivo: archivo.name,
        capa: capaDeArchivo(archivo.name),
        estado: ESTADO_VITEST[prueba.status] ?? 'salteada',
        mensajes: prueba.failureMessages ?? [],
        caso: prueba.meta?.caso ?? null,
        duracionMs: prueba.duration ?? 0,
      });
    }
  }
  return { pruebas, archivosRotos };
}

function recorrerSuites(suites, visitar) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      visitar(spec);
    }
    recorrerSuites(suite.suites, visitar);
  }
}

// Informe JSON de Playwright → pruebas normalizadas.
/** @param {string} ruta @returns {Informe | null} */
export function leerInformeDePlaywright(ruta) {
  const informe = leerJson(ruta);
  if (!informe) {
    return null;
  }
  const pruebas = [];
  recorrerSuites(informe.suites, (spec) => {
    for (const prueba of spec.tests ?? []) {
      const ultimo = prueba.results?.at(-1);
      const estado =
        prueba.status === 'expected' ? 'paso' : prueba.status === 'skipped' ? 'salteada' : 'fallo';
      pruebas.push({
        titulo: spec.title,
        archivo: `tests/e2e/${spec.file}`,
        capa: 'Punta a punta',
        estado,
        mensajes: (ultimo?.errors ?? []).map((e) => e.message ?? ''),
        caso: null,
        duracionMs: ultimo?.duration ?? 0,
      });
    }
  });
  const erroresGenerales = (informe.errors ?? []).map((e) => e.message ?? String(e));
  return { pruebas, archivosRotos: erroresGenerales.map((mensaje) => ({ archivo: '', mensaje })) };
}

// Listados sin correr: «vitest list --json» y «playwright test --list --reporter=json».
export function titulosDeListadoDeVitest(listado) {
  return listado.map((p) => ({
    titulo: p.name.split(' > ').at(-1),
    archivo: p.file,
    capa: capaDeArchivo(p.file),
  }));
}

export function titulosDeListadoDePlaywright(informe) {
  const titulos = [];
  recorrerSuites(informe.suites, (spec) => {
    titulos.push({ titulo: spec.title, archivo: `tests/e2e/${spec.file}`, capa: 'Punta a punta' });
  });
  return titulos;
}
