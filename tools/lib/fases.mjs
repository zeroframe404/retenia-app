import { correr } from './proceso.mjs';

// Archivo con la cantidad de pruebas de la última corrida verde de cada orden. Queda
// guardado en cada tag fase-NN-ok y sirve para notar si después bajó.
export const ARCHIVO_DE_CONTEO = 'tests/conteo.json';

async function git(raiz, args) {
  const r = await correr('git', args, { cwd: raiz });
  return r.codigo === 0 ? r.salida.trim() : null;
}

// La fase en curso sale de la rama («fase-02»). En el CI de un pull request la rama llega
// por GITHUB_HEAD_REF. RETENIA_FASE la fija a mano (la usan las pruebas).
/** @param {string} raiz @returns {Promise<string | null>} */
export async function faseEnCurso(raiz) {
  const rama =
    process.env.RETENIA_FASE !== undefined
      ? `fase-${process.env.RETENIA_FASE}`
      : process.env.GITHUB_HEAD_REF || (await git(raiz, ['rev-parse', '--abbrev-ref', 'HEAD']));
  const coincide = /^fase-(\d{2})(?:$|[-/])/.exec(rama ?? '');
  return coincide ? coincide[1] : null;
}

// Tags fase-NN-ok alcanzables desde la versión actual, de la más vieja a la más nueva.
/** @param {string} raiz @returns {Promise<{ tag: string, numero: string }[]>} */
export async function tagsDeFasesCerradas(raiz) {
  const salida = await git(raiz, ['tag', '--merged', 'HEAD', '--list', 'fase-*-ok']);
  if (!salida) {
    return [];
  }
  return salida
    .split(/\r?\n/)
    .map((tag) => ({ tag, numero: /^fase-(\d{2})-ok$/.exec(tag)?.[1] }))
    .filter((t) => t.numero)
    .sort((a, b) => Number(a.numero) - Number(b.numero));
}

export async function conteoEnTag(raiz, tag) {
  const contenido = await git(raiz, ['show', `${tag}:${ARCHIVO_DE_CONTEO}`]);
  if (!contenido) {
    return null;
  }
  try {
    return JSON.parse(contenido);
  } catch {
    return null;
  }
}
