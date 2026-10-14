import { run } from './proceso.mjs';

/** @param {string} root @param {string[]} args */
async function git(root, args) {
  const r = await run('git', args, { cwd: root });
  return r.code === 0 ? r.stdout.trim() : null;
}

// La fase en curso sale de la rama («fase-02»). En el CI de un pull request la rama llega
// por GITHUB_HEAD_REF. RETENIA_FASE la fija a mano.
/** @param {string} root @returns {Promise<string | null>} */
export async function currentPhase(root) {
  const branch =
    process.env.RETENIA_FASE !== undefined
      ? `fase-${process.env.RETENIA_FASE}`
      : process.env.GITHUB_HEAD_REF || (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD']));
  const match = /^fase-(\d{2})(?:$|[-/])/.exec(branch ?? '');
  return match?.[1] ?? null;
}

// Tags fase-NN-ok alcanzables desde la versión actual, de la más vieja a la más nueva.
/** @param {string} root @returns {Promise<{ tag: string, number: string }[]>} */
export async function closedPhaseTags(root) {
  const out = await git(root, ['tag', '--merged', 'HEAD', '--list', 'fase-*-ok']);
  if (!out) {
    return [];
  }
  return out
    .split(/\r?\n/)
    .map((tag) => ({ tag, number: /^fase-(\d{2})-ok$/.exec(tag)?.[1] ?? '' }))
    .filter((t) => t.number !== '')
    .sort((a, b) => Number(a.number) - Number(b.number));
}

// El mensaje de un tag fase-NN-ok que crea «npm run cerrar-fase» guarda cuántas pruebas
// tenía cada orden: «Pruebas de verificar: 44» y «Pruebas de verificar:todo: 57».
// Un tag sin esos renglones (las Fases 00 y 01 no tenían pruebas) cuenta como 0.
/** @param {string} message @returns {{ 'verificar': number, 'verificar:todo': number }} */
export function parseTagCounts(message) {
  const fast = /^Pruebas de verificar: (\d+)$/m.exec(message)?.[1];
  const full = /^Pruebas de verificar:todo: (\d+)$/m.exec(message)?.[1];
  return { verificar: Number(fast ?? 0), 'verificar:todo': Number(full ?? 0) };
}

/** @param {{ 'verificar': number, 'verificar:todo': number }} counts @param {string} phase */
export function tagMessage(counts, phase) {
  return [
    `Fase ${phase} aprobada.`,
    '',
    `Pruebas de verificar: ${counts.verificar}`,
    `Pruebas de verificar:todo: ${counts['verificar:todo']}`,
  ].join('\n');
}

/** @param {string} root @param {string} tag */
export async function testCountsAtTag(root, tag) {
  return parseTagCounts((await git(root, ['tag', '-l', '--format=%(contents)', tag])) ?? '');
}
