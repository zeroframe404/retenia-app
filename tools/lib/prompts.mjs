import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from './proceso.mjs';

// «Una versión de un prompt no cambia nunca» (Fase 19): cambiar el texto de un prompt obliga a subir
// su versión, porque las respuestas guardadas y «Qué se envió» dicen con qué versión se pidieron.
// src/ai/prompts/versiones.json guarda la huella de cada versión; acá se compara cada una con la que
// tuvo la primera vez que entró al historial de git (no contra el archivo de hoy, que se podría
// actualizar junto con el prompt).

const LOCKS = 'src/ai/prompts/versiones.json';

/** @param {string} root @param {string[]} args */
async function git(root, args) {
  const result = await run('git', args, { cwd: root });
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} falló: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

/** @param {string} text @returns {Record<string, Record<string, string>>} */
const parse = (text) => JSON.parse(text);

/**
 * Las versiones de prompts del historial que cambiaron de huella o desaparecieron.
 * @param {string} root
 * @returns {Promise<{ prompt: string, version: string, problem: 'cambió' | 'ya no existe' }[]>}
 */
export async function changedPromptVersions(root) {
  const commits = (await git(root, ['log', '--reverse', '--format=%H', '--', LOCKS]))
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  /** @type {Map<string, { prompt: string, version: string, hash: string }>} */
  const first = new Map();
  for (const commit of commits) {
    const locks = parse(await git(root, ['show', `${commit}:${LOCKS}`]));
    for (const [prompt, versions] of Object.entries(locks)) {
      for (const [version, hash] of Object.entries(versions)) {
        const key = JSON.stringify([prompt, version]);
        if (!first.has(key)) {
          first.set(key, { prompt, version, hash });
        }
      }
    }
  }
  const current = parse(readFileSync(join(root, LOCKS), 'utf8'));
  /** @type {{ prompt: string, version: string, problem: 'cambió' | 'ya no existe' }[]} */
  const problems = [];
  for (const { prompt, version, hash } of first.values()) {
    const now = current[prompt]?.[version];
    if (now === undefined) {
      problems.push({ prompt, version, problem: 'ya no existe' });
    } else if (now !== hash) {
      problems.push({ prompt, version, problem: 'cambió' });
    }
  }
  return problems;
}
