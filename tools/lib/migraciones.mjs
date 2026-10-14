import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from './proceso.mjs';

// «Una migración aplicada no se edita» (docs/modelo-de-datos.md, regla 4). Una migración que ya
// entró al historial de git puede estar aplicada en alguna base (la de una PC de prueba, la tuya
// instalada): tiene que seguir existiendo con el mismo nombre y ser idéntica a su primer commit.
// Se compara contra el historial y no contra una lista de huellas, que se podría actualizar
// junto con la migración. Vale para el SQL y para las instantáneas de drizzle-kit (de ellas sale
// la migración siguiente); el diario `_journal.json` crece con cada una y no entra.

const PATHSPECS = ['src/data/migrations/*.sql', 'src/data/migrations/meta/*_snapshot.json'];

/** @param {string} root @param {string[]} args */
async function git(root, args) {
  const result = await run('git', args, { cwd: root });
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} falló: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

/** @param {string} text */
const normalized = (text) => text.replace(/\r\n/g, '\n');

/**
 * Las migraciones del historial que cambiaron o desaparecieron.
 * @param {string} root
 * @returns {Promise<{ path: string, problem: 'cambió' | 'ya no existe' }[]>}
 */
export async function changedMigrations(root) {
  const listed = await git(root, [
    'log',
    '--diff-filter=A',
    '--name-only',
    '--format=',
    '--',
    ...PATHSPECS,
  ]);
  const paths = [...new Set(listed.split(/\r?\n/).filter((line) => line.trim() !== ''))].sort();
  /** @type {{ path: string, problem: 'cambió' | 'ya no existe' }[]} */
  const problems = [];
  for (const path of paths) {
    const firstCommit = (
      await git(root, ['log', '--diff-filter=A', '--format=%H', '--reverse', '--', path])
    )
      .split(/\r?\n/)
      .find((line) => line.trim() !== '');
    const original = await git(root, ['show', `${firstCommit}:${path}`]);
    const current = join(root, path);
    if (!existsSync(current)) {
      problems.push({ path, problem: 'ya no existe' });
    } else if (normalized(readFileSync(current, 'utf8')) !== normalized(original)) {
      problems.push({ path, problem: 'cambió' });
    }
  }
  return problems;
}
