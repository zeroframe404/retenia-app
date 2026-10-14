import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { run } from './proceso.mjs';

const IGNORED_FOLDERS = new Set([
  '.git',
  'node_modules',
  'out',
  '.cache',
  'datos-locales',
  'coverage',
  'playwright-report',
  'test-results',
]);

/**
 * @param {string} root
 * @param {string} folder
 * @param {string[]} list
 */
function walk(root, folder, list) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (IGNORED_FOLDERS.has(entry.name)) {
      continue;
    }
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      walk(root, path, list);
    } else if (entry.isFile()) {
      list.push(relative(root, path).split(sep).join('/'));
    }
  }
}

// Archivos del proyecto: los que sigue git más los nuevos que no están ignorados.
/** @param {string} root @returns {Promise<string[]>} */
export async function projectFiles(root) {
  const git = await run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
  });
  if (git.code === 0) {
    const seen = new Set(git.stdout.split('\0').filter(Boolean));
    return [...seen].filter((path) => existsSync(join(root, path))).sort();
  }
  /** @type {string[]} */
  const list = [];
  walk(root, root, list);
  return list.sort();
}

// Huella del estado del proyecto: cambia si cambia cualquier archivo.
/** @param {string} root @returns {Promise<string>} */
export async function projectFingerprint(root) {
  const hash = createHash('sha256');
  for (const path of await projectFiles(root)) {
    hash.update(path);
    hash.update('\0');
    hash.update(readFileSync(join(root, path)));
    hash.update('\0');
  }
  return hash.digest('hex');
}
