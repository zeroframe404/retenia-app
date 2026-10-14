// El cuerpo de la red de pruebas. Lo carga tools/verify.mjs.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { projectFiles, projectFingerprint } from './archivos.mjs';
import { readProjectSpec } from './especificacion.mjs';
import { closedPhaseTags, currentPhase, testCountsAtTag } from './fases.mjs';
import { listTitles } from './listado.mjs';
import { firstJson, npmCliPath, ROOT, run, runPackage, stripColors } from './proceso.mjs';
import { formatDuration, now, stopwatch } from './reloj.mjs';
import { scanProjectForSystemClock } from './reloj-del-sistema.mjs';
import { readPlaywrightReport, readVitestReport } from './resultados.mjs';
import { crossCheck } from './trazabilidad.mjs';
import {
  buildVerdict,
  explainFailure,
  findMarkers,
  skippedProblem,
  tagCountProblem,
} from './veredicto.mjs';

/**
 * @typedef {import('./veredicto.mjs').Problem} Problem
 * @typedef {import('./resultados.mjs').TestResult} TestResult
 * @typedef {import('./proceso.mjs').RunResult} RunResult
 */

const CORE_BRANCH_THRESHOLD = 90;
const FAST_PROJECTS = [
  'unitarias',
  'propiedades',
  'contrato',
  'componentes',
  'integracion',
  'estaticas',
];
const BINARY = /\.(png|jpe?g|gif|ico|exe|dll|pdf|zip|woff2?|ttf|db|onnx)$/i;

/** @param {{ full: boolean }} options @returns {Promise<number>} el código de salida */
export async function runNetwork({ full }) {
  const mode = full ? 'verificar:todo' : 'verificar';
  // Una corrida con RETENIA_RUN_DIR es aislada: escribe solo ahí (la usan las pruebas de la red).
  const isolated = Boolean(process.env.RETENIA_RUN_DIR);
  const runDir = resolve(
    process.env.RETENIA_RUN_DIR ??
      join(ROOT, '.cache', 'red', 'corridas', full ? 'todo' : 'rapida'),
  );
  const logsDir = join(runDir, 'registros');
  const testEnv = { ...process.env, RETENIA_RUN_DIR: runDir };
  mkdirSync(logsDir, { recursive: true });

  /** @param {string} name @param {RunResult} result */
  const saveLog = (name, result) => {
    writeFileSync(
      join(logsDir, `${name}.txt`),
      `código de salida: ${result.code}\n\n--- salida ---\n${result.stdout}\n--- errores ---\n${result.stderr}\n`,
    );
  };
  /** @param {string} path */
  const rel = (path) => relative(ROOT, path).split('\\').join('/');
  /** @param {string} text */
  const firstLine = (text) =>
    stripColors(text ?? '')
      .split(/\r?\n/)
      .find((l) => l.trim() !== '')
      ?.trim() ?? '';
  /** @param {string} name @param {RunResult} r */
  const toolFailure = (name, r) =>
    r.timedOut
      ? `${name} tardó demasiado y la corté. Mirá ${rel(join(logsDir, `${name}.txt`))}.`
      : `${name} terminó con error: ${firstLine(r.stderr) || firstLine(r.stdout) || `código ${r.code}`}. Mirá el registro completo.`;
  /** @param {string} text */
  const tryJson = (text) => {
    try {
      return firstJson(text);
    } catch {
      return null;
    }
  };

  // ---------- Capas ----------

  const lint = async () => {
    const r = await runPackage('@biomejs/biome', 'biome', [
      'ci',
      '--reporter=json',
      '--colors=off',
      '--error-on-warnings',
      '.',
    ]);
    saveLog('formato-y-linter', r);
    if (r.code === 0) {
      return [];
    }
    const diagnostics = tryJson(r.stdout)?.diagnostics ?? [];
    if (diagnostics.length === 0) {
      return [toolFailure('formato-y-linter', r)];
    }
    return diagnostics.map((/** @type {any} */ d) => {
      const path = (d.location?.path ?? '').split('\\').join('/');
      const line = d.location?.start?.line ? `:${d.location.start.line}` : '';
      if (d.category === 'format') {
        return `${path} no tiene el formato acordado (se arregla con «npx biome check --write ${path}»).`;
      }
      return `${path}${line}: ${d.message} (${d.category}).`;
    });
  };

  const types = async () => {
    const configs = [
      'tsconfig.json',
      'tsconfig.web.json',
      'tsconfig.e2e.json',
      'tsconfig.componentes.json',
    ];
    const results = await Promise.all(
      configs.map((c) =>
        runPackage('typescript', 'tsc', ['-p', c, '--noEmit', '--pretty', 'false']),
      ),
    );
    /** @type {string[]} */
    const problems = [];
    results.forEach((r, i) => {
      saveLog(`tipos-${configs[i]}`, r);
      if (r.code === 0) {
        return;
      }
      const errors = [
        ...`${r.stdout}\n${r.stderr}`.matchAll(/^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/gm),
      ];
      if (errors.length === 0) {
        problems.push(toolFailure(`tipos-${configs[i]}`, r));
      }
      for (const [, file, line, code, message] of errors) {
        problems.push(`${(file ?? '').split('\\').join('/')}:${line}: ${message} (${code}).`);
      }
    });
    return problems;
  };

  const layering = async () => {
    const r = await runPackage('dependency-cruiser', 'depcruise', [
      'src',
      '--config',
      '.dependency-cruiser.cjs',
      '--output-type',
      'json',
    ]);
    saveLog('capas', r);
    const report = tryJson(r.stdout);
    if (!report) {
      return [toolFailure('capas', r)];
    }
    /** @type {Map<string, string>} */
    const comments = new Map(
      (report.summary.ruleSetUsed?.forbidden ?? []).map((/** @type {any} */ rule) => [
        rule.name,
        rule.comment,
      ]),
    );
    return report.summary.violations.map(
      (/** @type {any} */ v) =>
        `«${v.from}» importa «${v.to}». ${comments.get(v.rule.name) ?? ''} (regla ${v.rule.name}).`,
    );
  };

  const deadCode = async () => {
    // Sin la «transferencia directa» del lector de knip: reserva 6 GiB por proceso, y Windows
    // los cuenta contra el límite de memoria; con varias corridas a la vez en el CI, falla.
    const r = await runPackage('knip', 'knip', ['--reporter', 'json', '--no-progress'], {
      env: { ...process.env, KNIP_DISABLE_RAW_TRANSFER: '1' },
    });
    saveLog('codigo-muerto', r);
    if (r.code === 0) {
      return [];
    }
    const report = tryJson(r.stdout);
    if (!report) {
      return [toolFailure('codigo-muerto', r)];
    }
    /** @type {Record<string, string>} */
    const WHAT = {
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
    /** @type {string[]} */
    const problems = (report.files ?? []).map((/** @type {string} */ f) => `${f}: ${WHAT.files}.`);
    for (const issue of report.issues ?? []) {
      for (const [kind, list] of Object.entries(issue)) {
        if (!Array.isArray(list) || !(kind in WHAT) || kind === 'files') {
          continue;
        }
        for (const item of list) {
          const name = Array.isArray(item) ? item.map((x) => x.name).join(', ') : item.name;
          const line = item.line ? `:${item.line}` : '';
          problems.push(`${issue.file}${line}: ${WHAT[kind]} («${name}»).`);
        }
      }
    }
    return problems.length > 0 ? problems : [toolFailure('codigo-muerto', r)];
  };

  const secrets = async () => {
    const files = (await projectFiles(ROOT)).filter((f) => !BINARY.test(f));
    /** @type {string[]} */
    const problems = [];
    for (let i = 0; i < files.length; i += 80) {
      const r = await runPackage('secretlint', 'secretlint', [
        '--format',
        'json',
        '--no-color',
        ...files.slice(i, i + 80),
      ]);
      saveLog(`secretos-${i / 80 + 1}`, {
        ...r,
        stdout: '(informe omitido: puede tener contenido de archivos)',
      });
      if (r.code === 0) {
        continue;
      }
      const report = tryJson(r.stdout);
      if (!report) {
        problems.push(toolFailure('secretos', r));
        continue;
      }
      for (const file of report) {
        for (const m of file.messages ?? []) {
          const rule = String(m.ruleId ?? '').replace('@secretlint/secretlint-rule-', '');
          problems.push(
            `posible secreto en ${rel(file.filePath)}:${m.loc?.start?.line ?? '?'} (${rule}). Un secreto nunca va en el repositorio: la clave de IA vive solo en el almacén seguro de Windows.`,
          );
        }
      }
    }
    return problems;
  };

  /** @param {string[]} projects @param {string} name */
  const runVitest = async (projects, name) => {
    const reportPath = join(runDir, `${name}.json`);
    const coverageDir = join(runDir, `cobertura-${name}`);
    rmSync(reportPath, { force: true });
    rmSync(coverageDir, { recursive: true, force: true });
    const r = await runPackage(
      'vitest',
      'vitest',
      [
        'run',
        ...projects.flatMap((p) => ['--project', p]),
        '--reporter=json',
        `--outputFile=${reportPath}`,
        ...(name === 'pruebas'
          ? ['--coverage.enabled', `--coverage.reportsDirectory=${coverageDir}`]
          : []),
      ],
      { env: testEnv, timeoutMs: name === 'pruebas' ? 300_000 : 900_000 },
    );
    saveLog(name, r);
    return { r, report: readVitestReport(reportPath), coverageDir };
  };

  /** @param {string} name @param {{ r: RunResult, report: import('./resultados.mjs').Report | null }} outcome */
  const testProblems = (name, { r, report }) => {
    /** @type {Problem[]} */
    const problems = [];
    if (!report) {
      return { tests: [], problems: [{ layer: 'Pruebas', text: toolFailure(name, r) }] };
    }
    for (const broken of report.brokenFiles) {
      problems.push({
        layer: 'Pruebas',
        text: `no se pudo cargar ${broken.file ? rel(broken.file) : 'un archivo de pruebas'}: ${firstLine(broken.message)}`,
      });
    }
    for (const test of report.tests.filter((t) => t.status === 'failed')) {
      const message = stripColors(test.messages[0] ?? '');
      const where = /(tests[\\/][^\s:()]+:\d+)/.exec(message)?.[1]?.split('\\').join('/');
      problems.push({
        layer: 'Pruebas',
        text: `falló «${test.title}» (${test.layer}). ${explainFailure(message)}${where ? ` (${where})` : ''}`,
      });
    }
    if (r.timedOut) {
      problems.push({ layer: 'Pruebas', text: toolFailure(name, r) });
    } else if (
      r.code !== 0 &&
      problems.length === 0 &&
      report.tests.every((t) => t.status !== 'skipped')
    ) {
      problems.push({ layer: 'Pruebas', text: toolFailure(name, r) });
    }
    return { tests: report.tests, problems };
  };

  const listing = async () => {
    const { titles, errors, raw } = await listTitles({ env: testEnv });
    saveLog('listado-vitest', raw.vitest);
    saveLog('listado-punta-a-punta', raw.e2e);
    return { titles, problems: errors.map((e) => toolFailure(e.name, e.result)) };
  };

  const markersInTests = async () => {
    const files = (await projectFiles(ROOT)).filter((f) => /^tests\/.+\.(test|spec)\.ts$/.test(f));
    return files.flatMap((file) =>
      findMarkers(readFileSync(join(ROOT, file), 'utf8')).map((m) => ({ ...m, file })),
    );
  };

  // Las dos variantes compiladas y empaquetadas sin instalar (release/<variante>/win-unpacked):
  // la punta a punta abre la de prueba y las pruebas del paquete leen las dos.
  const build = async () => {
    const r = await run(process.execPath, [join(ROOT, 'tools', 'construir.mjs')], {
      timeoutMs: 900_000,
    });
    saveLog('compilar', r);
    return r.code === 0 ? [] : [toolFailure('compilar', r)];
  };

  const endToEnd = async () => {
    const reportPath = join(runDir, 'punta-a-punta', 'informe.json');
    rmSync(reportPath, { force: true });
    const r = await runPackage('@playwright/test', 'playwright', ['test'], {
      env: testEnv,
      timeoutMs: 600_000,
    });
    saveLog('punta-a-punta', r);
    return { r, report: readPlaywrightReport(reportPath) };
  };

  const audit = async () => {
    const r = await run(process.execPath, [npmCliPath(), 'audit', '--json'], {
      timeoutMs: 180_000,
    });
    saveLog('auditoria', r);
    const report = tryJson(r.stdout);
    const v = report?.metadata?.vulnerabilities;
    if (!v) {
      return [
        `no pude consultar la auditoría de dependencias (¿sin internet?): ${firstLine(r.stderr) || firstLine(r.stdout)}.`,
      ];
    }
    const serious = (v.high ?? 0) + (v.critical ?? 0);
    if (serious === 0) {
      return [];
    }
    const names = Object.entries(report.vulnerabilities ?? {})
      .filter(([, d]) => d.severity === 'high' || d.severity === 'critical')
      .map(([name, d]) => `${name} (${d.severity === 'critical' ? 'crítica' : 'alta'})`);
    return [
      `hay ${serious} vulnerabilidades altas o críticas en las dependencias: ${names.join(', ')}.`,
    ];
  };

  const securityScan = async () => {
    const exe = join(ROOT, 'tools', 'bin', 'opengrep.exe');
    if (!existsSync(exe)) {
      const p = await run(process.execPath, [join(ROOT, 'tools', 'preparar.mjs')], {
        timeoutMs: 300_000,
      });
      saveLog('preparar', p);
      if (p.code !== 0 || !existsSync(exe)) {
        return [`no pude preparar Opengrep: ${firstLine(p.stderr) || firstLine(p.stdout)}.`];
      }
    }
    const r = await run(
      exe,
      [
        'scan',
        '--config',
        'tools/opengrep/reglas.yml',
        '--json',
        '--quiet',
        'src',
        'tools',
        'tests',
      ],
      { timeoutMs: 300_000 },
    );
    saveLog('seguridad-estatica', r);
    const report = tryJson(r.stdout);
    if (!report || !Array.isArray(report.results)) {
      return [toolFailure('seguridad-estatica', r)];
    }
    const problems = report.results.map(
      (/** @type {any} */ h) =>
        `${h.path.split('\\').join('/')}:${h.start?.line}: ${h.extra?.message ?? h.check_id}`,
    );
    for (const e of report.errors ?? []) {
      problems.push(`Opengrep no pudo analizar algo: ${firstLine(e.message ?? String(e))}`);
    }
    return problems;
  };

  // ---------- Armado ----------

  /** @type {{ id: string, name: string, problems: Problem[], durationMs: number }[]} */
  const layers = [];

  /**
   * @template T
   * @param {string} id
   * @param {string} name
   * @param {() => Promise<T>} work
   * @returns {Promise<T>}
   */
  const layer = async (id, name, work) => {
    const elapsed = stopwatch();
    const result = await work();
    const list = Array.isArray(result)
      ? result
      : /** @type {{ problems: (string | Problem)[] }} */ (result).problems;
    const problems = list.map((p) => (typeof p === 'string' ? { layer: name, text: p } : p));
    layers.push({ id, name, problems, durationMs: elapsed() });
    const weight = problems.reduce((s, p) => s + (p.weight ?? 1), 0);
    const state = weight === 0 ? 'bien' : `${weight} ${weight === 1 ? 'falla' : 'fallas'}`;
    console.log(`  ${`${name} `.padEnd(38, '.')} ${state} (${formatDuration(elapsed())})`);
    return result;
  };

  const total = stopwatch();
  const startedAt = now();
  const fingerprint = await projectFingerprint(ROOT);
  console.log(`Red de Retenia · ${mode}${full ? ' (todo, con punta a punta)' : ' (rápida)'}`);

  const spec = readProjectSpec(ROOT);
  const [phase, tags] = await Promise.all([currentPhase(ROOT), closedPhaseTags(ROOT)]);

  /** @type {TestResult[]} */
  let fastTests = [];
  /** @type {string | null} */
  let coverageDir = null;
  /** @type {{ line: number, marker: string, kind: string, file: string }[]} */
  let markers = [];

  const [listed] = await Promise.all([
    (async () => {
      const result = await listing();
      markers = await markersInTests();
      return result;
    })(),
    layer('formato', 'Formato y linter', lint),
    layer('reloj', 'Reloj del sistema', () => scanProjectForSystemClock(ROOT)),
    layer('tipos', 'Tipos', types),
    layer('capas', 'Capas', layering),
    layer('codigo-muerto', 'Código muerto', deadCode),
    layer('secretos', 'Escáner de secretos', secrets),
    layer('pruebas', 'Pruebas unitarias y de integración', async () => {
      const outcome = await runVitest(FAST_PROJECTS, 'pruebas');
      coverageDir = outcome.coverageDir;
      const { tests, problems } = testProblems('pruebas', outcome);
      fastTests = tests;
      return problems;
    }),
    full
      ? layer('compilar', 'Compilar y empaquetar las dos variantes', build)
      : Promise.resolve([]),
  ]);

  /** @type {TestResult[]} */
  let fullTests = [];
  if (full) {
    const built = layers.find((l) => l.id === 'compilar')?.problems.length === 0;
    /** @type {{ tests: TestResult[], problems: Problem[] }} */
    let e2e = { tests: [], problems: [] };
    await Promise.all([
      layer('punta-a-punta', 'Punta a punta (ventana real)', async () => {
        if (!built) {
          return ['no corrió porque no se pudo compilar y empaquetar la variante de prueba.'];
        }
        e2e = testProblems('punta-a-punta', await endToEnd());
        return e2e.problems.filter((p) => !p.text.includes('accesibilidad:'));
      }),
      layer('auditoria', 'Auditoría de dependencias', audit),
      layer('seguridad', 'Análisis estático de seguridad', securityScan),
    ]);
    await layer('accesibilidad', 'Accesibilidad', async () => {
      const a11y = e2e.tests.filter((t) => t.title.startsWith('accesibilidad:'));
      if (built && a11y.length === 0) {
        return ['no encontré ninguna prueba de accesibilidad en la punta a punta.'];
      }
      return e2e.problems.filter((p) => p.text.includes('accesibilidad:'));
    });
    await layer('red', 'Paquete, red completa y sabotajes', async () => {
      if (!built) {
        return ['no corrió porque no se pudo compilar y empaquetar las dos variantes.'];
      }
      const { tests, problems } = testProblems('red', await runVitest(['paquete', 'red'], 'red'));
      fullTests = [...e2e.tests, ...tests];
      return problems;
    });
  }

  const tests = [...fastTests, ...fullTests];

  // Salteadas: las que el corredor salteó, más las marcadas en archivos que no corrieron.
  const skipped = tests.filter((t) => t.status === 'skipped');
  const ranFiles = new Set(tests.map((t) => rel(resolve(ROOT, t.file))));
  const unrunMarkers = markers.filter((m) => m.kind === 'skip' && !ranFiles.has(m.file));
  await layer('salteadas', 'Pruebas salteadas o solas', async () => {
    /** @type {Problem[]} */
    const problems = [];
    const notice = skippedProblem(skipped, unrunMarkers);
    if (notice) {
      problems.push(notice);
    }
    for (const m of markers.filter((x) => x.kind === 'only')) {
      problems.push({
        layer: 'Salteadas',
        text: `${m.file}:${m.line} tiene «${m.marker}»: hace correr solo esa prueba y esconde las demás. Sacala.`,
      });
    }
    return problems;
  });

  const trace = crossCheck({
    spec,
    titles: listed.titles,
    closed: tags.map((t) => t.number),
    current: phase,
    requireCurrent: full,
  });
  await layer('trazabilidad', 'Trazabilidad de criterios', async () => [
    ...listed.problems,
    ...trace.problems,
  ]);

  /** @type {{ branches: number, lines: number, threshold: number } | null} */
  let coverage = null;
  await layer('cobertura', 'Cobertura de ramas del núcleo', async () => {
    const summary = coverageDir && join(coverageDir, 'coverage-summary.json');
    if (!summary || !existsSync(summary)) {
      return [];
    }
    const totals = JSON.parse(readFileSync(summary, 'utf8')).total;
    if (totals.lines.total === 0) {
      return [
        'la medición de cobertura no encontró ningún archivo de src/core: las pruebas no cargaron el núcleo o la ruta del proyecto no coincide.',
      ];
    }
    coverage = {
      branches: totals.branches.pct,
      lines: totals.lines.pct,
      threshold: CORE_BRANCH_THRESHOLD,
    };
    return totals.branches.pct < CORE_BRANCH_THRESHOLD
      ? [
          `las pruebas recorren el ${totals.branches.pct} % de las ramas de src/core y el mínimo es ${CORE_BRANCH_THRESHOLD} %.`,
        ]
      : [];
  });

  // La cantidad de pruebas no baja respecto del último tag fase-NN-ok.
  const ranCount = tests.filter((t) => t.status !== 'skipped').length;
  await layer('cantidad', 'Cantidad de pruebas', async () => {
    const last = tags.at(-1);
    if (!last) {
      return [];
    }
    const counts = await testCountsAtTag(ROOT, last.tag);
    const notice = tagCountProblem({
      tag: last.tag,
      phase: last.number,
      atTag: counts?.[mode] ?? null,
      current: ranCount,
    });
    return notice ? [notice] : [];
  });

  const problems = layers.flatMap((l) => l.problems);
  const durationMs = total();
  console.log(`  Tiempo total: ${formatDuration(durationMs)}`);
  const verdict = buildVerdict({
    problems,
    counts: {
      run: ranCount,
      failed: tests.filter((t) => t.status === 'failed').length,
      skipped: skipped.length + unrunMarkers.length,
      covered: trace.covered,
      criteria: trace.total,
    },
    logs: rel(logsDir) || logsDir,
  });

  const result = {
    mode,
    date: startedAt.toISOString(),
    durationMs,
    currentPhase: phase,
    closedPhases: tags.map((t) => t.number),
    layers: layers.map((l) => ({
      id: l.id,
      name: l.name,
      failures: l.problems.reduce((s, p) => s + (p.weight ?? 1), 0),
      durationMs: l.durationMs,
    })),
    tests,
    // Cuántas pruebas corrió cada orden: «npm run cerrar-fase» las guarda en el tag.
    counts: {
      verificar: fastTests.filter((t) => t.status !== 'skipped').length,
      'verificar:todo': full ? ranCount : null,
    },
    traceability: {
      covered: trace.covered,
      total: trace.total,
      criteria: trace.criteria.map((c) => ({ id: c.id, phase: c.phase, tests: c.tests })),
    },
    coverage,
    verdict: verdict.lines,
  };
  writeFileSync(join(runDir, 'resultado.json'), `${JSON.stringify(result, null, 2)}\n`);

  if (!isolated) {
    const latest = join(ROOT, '.cache', 'red', 'ultimo');
    mkdirSync(latest, { recursive: true });
    writeFileSync(join(latest, full ? 'todo.json' : 'rapida.json'), JSON.stringify(result));
    if (verdict.green) {
      writeFileSync(
        join(ROOT, '.cache', 'red', 'ultima-verde.json'),
        JSON.stringify({ fingerprint, date: startedAt.toISOString(), mode }),
      );
    }
  }

  console.log('');
  for (const line of verdict.lines) {
    console.log(line);
  }
  return verdict.green ? 0 : 1;
}
