// Regla «reloj del sistema», hecha de forma independiente de Biome: lee el código como árbol
// (los comentarios no la pueden apagar). Fuera de src/core/clock:
// - `Date` solo sirve para armar fechas a mano: `new Date(algo)`, `Date.UTC(…)`, `Date.parse(…)`.
// - `performance`, `process` y `Temporal` solo se usan leyendo una propiedad fija que no da la
//   hora (`process.env` sí; `performance.now`, `performance.timeOrigin`, `process.hrtime` y
//   `Temporal.Now` no).
// - El objeto global (`globalThis`, `window`, `self`, `global`) solo se usa leyendo una
//   propiedad fija; si esa propiedad es una de las de arriba, rige lo mismo.
// - Guardar cualquiera de ellos en otra variable, desarmarlo, pasarlo a una función o leerlo con
//   un nombre armado en el momento es falta, porque así se escaparía de la regla.
// - Importar `perf_hooks` o `process`, y llamar a un formateador sin fecha (`.format()`), también.
// - Apagar la regla de Biome con un comentario, también.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSync } from '@swc/core';
import { projectFiles } from './archivos.mjs';

const CODE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const EXEMPT = 'src/core/clock/';
const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self', 'global']);
const WATCHED = new Set(['Date', 'performance', 'process', 'Temporal']);
const FORBIDDEN_MODULES = new Set(['perf_hooks', 'node:perf_hooks', 'process', 'node:process']);
/** @type {Record<string, (name: string | null) => boolean>} */
const ALLOWED_PROPERTY = {
  Date: (name) => name === 'UTC' || name === 'parse',
  performance: (name) => name !== null && name !== 'now' && name !== 'timeOrigin',
  process: (name) => name !== null && name !== 'hrtime',
  Temporal: (name) => name !== null && name !== 'Now',
};
// Se arma por partes para que este archivo no contenga el comentario que prohíbe.
const SUPPRESSION = new RegExp(`${'biome'}-ignore(?:-all|-start)?\\s+lint/plugin`);
const TYPE_WRAPPERS = new Set([
  'TsAsExpression',
  'TsSatisfiesExpression',
  'TsNonNullExpression',
  'TsTypeAssertion',
  'TsConstAssertion',
  'TsInstantiation',
]);
const TRANSPARENT = new Set(['ParenthesisExpression', ...TYPE_WRAPPERS]);
const BINDING_KEYS = new Set([
  'key',
  'id',
  'label',
  'local',
  'imported',
  'exported',
  'pat',
  'params',
  'param',
]);

// El nombre fijo de una propiedad: `x.a`, `x['a']`, x[`a`]. Si se arma en el momento, null.
/** @param {any} node @returns {string | null} */
function staticName(node) {
  if (node?.type === 'Identifier') {
    return node.value;
  }
  if (node?.type !== 'Computed') {
    return null;
  }
  const e = node.expression;
  if (e?.type === 'StringLiteral') {
    return e.value;
  }
  if (e?.type === 'TemplateLiteral' && (e.expressions ?? []).length === 0) {
    return e.quasis?.[0]?.cooked ?? null;
  }
  return null;
}

/** @param {any} node */
function isUndefinedValue(node) {
  return (
    (node?.type === 'Identifier' && node.value === 'undefined') ||
    (node?.type === 'UnaryExpression' && node.operator === 'void')
  );
}

/**
 * @param {string} source
 * @param {string} file
 * @returns {{ line: number, text: string }[]}
 */
export function findSystemClockReads(source, file) {
  /** @type {{ line: number, text: string }[]} */
  const findings = [];
  const bytes = Buffer.from(source, 'utf8');
  source.split(/\r?\n/).forEach((line, i) => {
    if (SUPPRESSION.test(line)) {
      findings.push({ line: i + 1, text: 'apaga la regla del reloj con un comentario' });
    }
  });
  const typescript = /\.(ts|tsx|mts|cts)$/.test(file);
  // Las posiciones de swc no empiezan en 0 y saltean los comentarios iniciales: un «;» al
  // principio marca dónde empieza el archivo (sin mover ningún renglón).
  const anchored = `;${source.startsWith('#!') ? `//${source.slice(2)}` : source}`;
  const module = parseSync(anchored, {
    syntax: typescript ? 'typescript' : 'ecmascript',
    tsx: file.endsWith('.tsx'),
    jsx: file.endsWith('.jsx'),
    target: 'es2024',
  });
  const base = module.span.start + 1;
  /** @param {any} node @param {string} text */
  const report = (node, text) => {
    const offset = Math.max(0, node.span.start - base);
    const line = bytes.subarray(0, offset).toString('utf8').split('\n').length;
    findings.push({ line, text });
  };

  // `ref` nombra a uno de los globales vigilados (`name`) y está en `key` de su padre. Decide si
  // ese uso está permitido mirando al padre, sin contar paréntesis ni anotaciones de tipos.
  /** @param {string} name @param {any} ref @param {string} key @param {any[]} ancestors */
  const checkUse = (name, ref, key, ancestors) => {
    let childKey = key;
    let index = ancestors.length - 1;
    while (TRANSPARENT.has(ancestors[index]?.node?.type)) {
      childKey = ancestors[index].key;
      index--;
    }
    const parent = ancestors[index]?.node;
    const asObject = parent?.type === 'MemberExpression' && childKey === 'object';
    const property = asObject ? staticName(parent.property) : null;
    if (GLOBAL_OBJECTS.has(name)) {
      if (!asObject) {
        report(
          ref,
          `el objeto global (\`${name}\`) usado como valor (si es una variable propia, usá otro nombre)`,
        );
      } else if (property === null) {
        report(ref, `el objeto global (\`${name}\`) leído con un nombre armado en el momento`);
      }
      return;
    }
    if (name === 'Date' && parent?.type === 'NewExpression' && childKey === 'callee') {
      const args = parent.arguments ?? [];
      if (args.length === 0 || args.some((/** @type {any} */ a) => a.spread)) {
        report(ref, '`new Date()` sin fecha lee la hora del sistema');
      }
      return;
    }
    if (asObject) {
      if (!ALLOWED_PROPERTY[name]?.(property)) {
        report(ref, `\`${name}.${property ?? '[…]'}\` no está permitido fuera del reloj`);
      }
      return;
    }
    report(
      ref,
      `\`${name}\` usado como valor (llamado, guardado, desarmado o pasado a otra función)`,
    );
  };

  /** @param {any} node @param {any[]} ancestors @param {string} key */
  const visit = (node, ancestors, key) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, ancestors, key);
      }
      return;
    }
    const type = node.type;
    if (typeof type === 'string' && type.startsWith('Ts')) {
      if (TYPE_WRAPPERS.has(type)) {
        visit(node.expression, [...ancestors, { node, key }], 'expression');
      }
      return;
    }
    const parent = ancestors.at(-1)?.node;
    const isPropertyName =
      parent?.type === 'MemberExpression' && key === 'property' && type === 'Identifier';
    if (type === 'Identifier' && !isPropertyName && !BINDING_KEYS.has(key)) {
      if (WATCHED.has(node.value) || GLOBAL_OBJECTS.has(node.value)) {
        checkUse(node.value, node, key, ancestors);
      }
    }
    if (type === 'MemberExpression') {
      const object = node.object?.type === 'Identifier' ? node.object.value : null;
      const name = staticName(node.property);
      if (object !== null && GLOBAL_OBJECTS.has(object) && name !== null) {
        if (WATCHED.has(name) || GLOBAL_OBJECTS.has(name)) {
          checkUse(name, node, key, ancestors);
        }
      }
    }
    if (type === 'CallExpression') {
      const callee = node.callee;
      const args = node.arguments ?? [];
      const method = callee?.type === 'MemberExpression' ? staticName(callee.property) : null;
      const noDate =
        args.length === 0 || (args.length === 1 && isUndefinedValue(args[0]?.expression));
      if ((method === 'format' || method === 'formatToParts') && noDate) {
        report(node, `\`.${method}()\` sin fecha formatea la hora del sistema`);
      }
      const loads =
        (callee?.type === 'Identifier' && callee.value === 'require') || callee?.type === 'Import';
      const target = args[0]?.expression;
      if (loads && target?.type === 'StringLiteral' && FORBIDDEN_MODULES.has(target.value)) {
        report(node, `carga «${target.value}», que da acceso al reloj del sistema`);
      }
    }
    if (type === 'ImportDeclaration' && FORBIDDEN_MODULES.has(node.source?.value)) {
      report(node, `importa «${node.source.value}», que da acceso al reloj del sistema`);
    }
    const next = [...ancestors, { node, key }];
    for (const [childKey, value] of Object.entries(node)) {
      if (childKey !== 'span' && value && typeof value === 'object') {
        visit(value, next, childKey);
      }
    }
  };
  visit(module.body, [], 'body');
  return findings.sort((a, b) => a.line - b.line);
}

// Todos los archivos de código del proyecto, menos el reloj.
/** @param {string} root @returns {Promise<string[]>} */
export async function scanProjectForSystemClock(root) {
  /** @type {string[]} */
  const problems = [];
  for (const file of await projectFiles(root)) {
    if (!CODE.test(file) || file.startsWith(EXEMPT)) {
      continue;
    }
    for (const f of findSystemClockReads(readFileSync(join(root, file), 'utf8'), file)) {
      problems.push(
        `${file}:${f.line}: ${f.text}. Solo src/core/clock lee la hora: recibí un Clock por parámetro.`,
      );
    }
  }
  return problems;
}
