import { existsSync, readFileSync } from 'node:fs';

/**
 * @typedef {{ table: string, input: string, expected: string, actual: string }} TableCase
 * @typedef {'passed' | 'failed' | 'skipped'} Status
 * @typedef {{ title: string, file: string, layer: string, status: Status, messages: string[], tableCase: TableCase | null, durationMs: number }} TestResult
 * @typedef {{ tests: TestResult[], brokenFiles: { file: string, message: string }[] }} Report
 * @typedef {{ title: string, file: string, layer: string }} ListedTest
 */

/** @type {Record<string, string>} */
const LAYERS = {
  unitarias: 'Unitaria',
  propiedades: 'Propiedades',
  contrato: 'Contrato del puente',
  integracion: 'Integración',
  estaticas: 'Estática',
  red: 'Red completa y sabotajes',
  e2e: 'Punta a punta',
};

/** @param {string} file */
export function layerOfFile(file) {
  const folder = /(?:^|[\\/])tests[\\/]([^\\/]+)[\\/]/.exec(file)?.[1] ?? '';
  return LAYERS[folder] ?? 'Otra';
}

const IDS_AT_START = /^((?:\[CA-\d{3}\]\s*)+)/;

// Los criterios que nombra una prueba: los identificadores entre corchetes al principio.
/** @param {string} title @returns {string[]} */
export function criteriaInTitle(title) {
  const prefix = IDS_AT_START.exec(title)?.[1] ?? '';
  return [...prefix.matchAll(/CA-\d{3}/g)].map((m) => m[0]);
}

// Una prueba que menciona un criterio pero no lo pone al principio entre corchetes.
/** @param {string} title */
export function isMalformedTitle(title) {
  return /CA-\d{3}/.test(title) && criteriaInTitle(title).length === 0;
}

/** @param {string} path */
function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

/** @type {Record<string, Status>} */
const VITEST_STATUS = {
  passed: 'passed',
  failed: 'failed',
  skipped: 'skipped',
  pending: 'skipped',
  todo: 'skipped',
};

// Informe JSON de Vitest → pruebas normalizadas, más los archivos que no se pudieron cargar.
/** @param {string} path @returns {Report | null} */
export function readVitestReport(path) {
  const report = readJson(path);
  if (!report) {
    return null;
  }
  /** @type {TestResult[]} */
  const tests = [];
  /** @type {{ file: string, message: string }[]} */
  const brokenFiles = [];
  for (const file of report.testResults ?? []) {
    if (file.status === 'failed' && (file.assertionResults ?? []).length === 0) {
      brokenFiles.push({ file: file.name, message: file.message ?? '' });
    }
    for (const test of file.assertionResults ?? []) {
      tests.push({
        title: test.title,
        file: file.name,
        layer: layerOfFile(file.name),
        status: VITEST_STATUS[test.status] ?? 'skipped',
        messages: test.failureMessages ?? [],
        tableCase: test.meta?.tableCase ?? null,
        durationMs: test.duration ?? 0,
      });
    }
  }
  return { tests, brokenFiles };
}

/** @param {any[]} suites @param {(spec: any) => void} visit */
function walkSuites(suites, visit) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      visit(spec);
    }
    walkSuites(suite.suites, visit);
  }
}

// Informe JSON de Playwright → pruebas normalizadas.
/** @param {string} path @returns {Report | null} */
export function readPlaywrightReport(path) {
  const report = readJson(path);
  if (!report) {
    return null;
  }
  /** @type {TestResult[]} */
  const tests = [];
  walkSuites(report.suites, (spec) => {
    for (const test of spec.tests ?? []) {
      const last = test.results?.at(-1);
      /** @type {Status} */
      const status =
        test.status === 'expected' ? 'passed' : test.status === 'skipped' ? 'skipped' : 'failed';
      tests.push({
        title: spec.title,
        file: `tests/e2e/${spec.file}`,
        layer: 'Punta a punta',
        status,
        messages: (last?.errors ?? []).map((/** @type {any} */ e) => e.message ?? ''),
        tableCase: null,
        durationMs: last?.duration ?? 0,
      });
    }
  });
  /** @type {string[]} */
  const general = (report.errors ?? []).map((/** @type {any} */ e) => e.message ?? String(e));
  return { tests, brokenFiles: general.map((message) => ({ file: '', message })) };
}

// Listados sin correr: «vitest list --json» y «playwright test --list --reporter=json».
/** @param {any[]} list @returns {ListedTest[]} */
export function titlesFromVitestList(list) {
  return list.map((t) => ({
    title: t.name.split(' > ').at(-1),
    file: t.file,
    layer: layerOfFile(t.file),
  }));
}

/** @param {any} report @returns {ListedTest[]} */
export function titlesFromPlaywrightList(report) {
  /** @type {ListedTest[]} */
  const titles = [];
  walkSuites(report.suites, (spec) => {
    titles.push({ title: spec.title, file: `tests/e2e/${spec.file}`, layer: 'Punta a punta' });
  });
  return titles;
}
