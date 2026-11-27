import { createHash } from 'node:crypto';
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
 * La huella con que git guarda un archivo (su «blob»), con los finales de línea de git.
 * @param {string} text
 */
function blobId(text) {
  const bytes = Buffer.from(normalized(text), 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

/**
 * Las migraciones del historial que cambiaron o desaparecieron.
 * Una sola pasada por el historial (del commit más viejo al más nuevo) da, de cada archivo, el commit
 * que lo agregó y la huella que tenía ahí; solo si la huella de hoy no coincide se compara el
 * contenido entero (así un archivo guardado con otros finales de línea no da un falso aviso).
 * @param {string} root
 * @returns {Promise<{ path: string, problem: 'cambió' | 'ya no existe' }[]>}
 */
export async function changedMigrations(root) {
  const log = await git(root, [
    'log',
    '--diff-filter=A',
    '--raw',
    '--no-abbrev',
    '--format=commit %H',
    '--reverse',
    '--',
    ...PATHSPECS,
  ]);
  /** @type {Map<string, { commit: string, blob: string }>} */
  const added = new Map();
  let commit = '';
  for (const line of log.split(/\r?\n/)) {
    if (line.startsWith('commit ')) {
      commit = line.slice('commit '.length).trim();
      continue;
    }
    // «:000000 100644 0000… <blob> A\t<ruta>»
    const raw = /^:\d+ \d+ [0-9a-f]+ ([0-9a-f]+) A\t(.+)$/.exec(line);
    if (raw?.[1] && raw[2] && !added.has(raw[2])) {
      added.set(raw[2], { commit, blob: raw[1] });
    }
  }
  /** @type {{ path: string, problem: 'cambió' | 'ya no existe' }[]} */
  const problems = [];
  for (const path of [...added.keys()].sort()) {
    const first = added.get(path);
    const current = join(root, path);
    if (!existsSync(current)) {
      problems.push({ path, problem: 'ya no existe' });
      continue;
    }
    const text = readFileSync(current, 'utf8');
    if (first && blobId(text) === first.blob) {
      continue;
    }
    const original = await git(root, ['show', `${first?.commit}:${path}`]);
    if (normalized(text) !== normalized(original)) {
      problems.push({ path, problem: 'cambió' });
    }
  }
  return problems;
}
