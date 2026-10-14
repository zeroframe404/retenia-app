// Regla «reloj del sistema», hecha de forma independiente de Biome: lee el código como árbol
// (los comentarios no la pueden apagar). Fuera de src/core/clock, `Date` solo se usa para
// armar fechas a mano: `new Date(algo)`, `Date.UTC(…)` y `Date.parse(…)`. Cualquier otro uso
// (`Date.now`, `new Date()`, `Date()`, guardarlo en una variable, pasarlo a otra función…),
// `performance.now`, `performance.timeOrigin`, `process.hrtime`, `Temporal.Now` y un
// formateador llamado sin fecha (`.format()`) son faltas. También lo es apagar la regla de
// Biome con un comentario.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSync } from '@swc/core';
import { projectFiles } from './archivos.mjs';

const CODE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const EXEMPT = 'src/core/clock/';
const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self', 'global']);
const DATE_STATIC_ALLOWED = new Set(['UTC', 'parse']);
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
const NOT_A_REFERENCE_KEYS = new Set(['key', 'id', 'label', 'local', 'imported', 'exported']);

/** @param {any} node @returns {string | null} */
function propertyName(node) {
  if (node?.type === 'Identifier') {
    return node.value;
  }
  if (node?.type === 'Computed' && node.expression?.type === 'StringLiteral') {
    return node.expression.value;
  }
  return null;
}

// ¿El nodo nombra a un global? `Date`, `globalThis.Date`, `window['Date']`…
/** @param {any} node @param {string} name */
function isGlobal(node, name) {
  if (node?.type === 'Identifier') {
    return node.value === name;
  }
  return (
    node?.type === 'MemberExpression' &&
    node.object?.type === 'Identifier' &&
    GLOBAL_OBJECTS.has(node.object.value) &&
    propertyName(node.property) === name
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
    jsx: false,
    target: 'es2024',
  });
  const base = module.span.start + 1;
  /** @param {any} node @param {string} text */
  const report = (node, text) => {
    const offset = Math.max(0, node.span.start - base);
    const line = bytes.subarray(0, offset).toString('utf8').split('\n').length;
    findings.push({ line, text });
  };

  // `ref` es un nodo que nombra a Date y `key` dónde está dentro de su padre; decide según
  // cómo lo usa el padre (saltando paréntesis).
  /** @param {any} ref @param {string} key @param {any[]} ancestors */
  const checkDateUse = (ref, key, ancestors) => {
    let childKey = key;
    let index = ancestors.length - 1;
    while (ancestors[index]?.node?.type === 'ParenthesisExpression') {
      childKey = ancestors[index].key;
      index--;
    }
    const p = ancestors[index]?.node;
    if (p?.type === 'NewExpression' && childKey === 'callee') {
      if ((p.arguments ?? []).length > 0) {
        return;
      }
      report(ref, '`new Date()` sin fecha lee la hora del sistema');
      return;
    }
    if (p?.type === 'MemberExpression' && childKey === 'object') {
      const name = propertyName(p.property);
      if (name !== null && DATE_STATIC_ALLOWED.has(name)) {
        return;
      }
      report(ref, `\`Date.${name ?? '[…]'}\` no está permitido fuera del reloj`);
      return;
    }
    report(ref, '`Date` usado como valor (llamado, guardado o pasado a otra función)');
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
    if (type === 'Identifier' && !isPropertyName && !NOT_A_REFERENCE_KEYS.has(key)) {
      if (node.value === 'Date') {
        checkDateUse(node, key, ancestors);
      }
    }
    if (type === 'MemberExpression') {
      const name = propertyName(node.property);
      if (isGlobal(node, 'Date')) {
        checkDateUse(node, key, ancestors);
      }
      if (isGlobal(node.object, 'performance') && (name === 'now' || name === 'timeOrigin')) {
        report(node, `\`performance.${name}\` lee el reloj del sistema`);
      }
      if (isGlobal(node.object, 'process') && name === 'hrtime') {
        report(node, '`process.hrtime` lee el reloj del sistema');
      }
      if (isGlobal(node.object, 'Temporal') && name === 'Now') {
        report(node, '`Temporal.Now` lee el reloj del sistema');
      }
    }
    if (type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
      const name = propertyName(node.callee.property);
      if ((name === 'format' || name === 'formatToParts') && (node.arguments ?? []).length === 0) {
        report(node, `\`.${name}()\` sin fecha formatea la hora del sistema`);
      }
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
