// Avisos de la auditoría de dependencias que se aceptan a conciencia.
// Solo los que NO tienen versión corregida y afectan a herramientas de desarrollo.
// Cualquier otro aviso alto o crítico sigue haciendo fallar la red.
// Cuando salga una versión corregida de la dependencia, el aviso desaparece solo
// de la auditoría y esta entrada se borra (ver docs/decisiones.md).
export const ACCEPTED_ADVISORIES = [
  {
    id: 'GHSA-fc5q-39xc-vjpf',
    package: 'picomatch',
    reason: 'ReDoS en extglobs repetidos; última versión publicada (4.0.7) todavía lo tiene',
  },
];

/** @param {unknown} via */
function advisoryIdOf(via) {
  const url = typeof via === 'object' && via !== null ? String(via.url ?? '') : '';
  return url.split('/').pop() ?? '';
}

/** @param {{ severity?: string } | undefined} item */
function isSerious(item) {
  return item?.severity === 'high' || item?.severity === 'critical';
}

/**
 * Vulnerabilidades altas o críticas que quedan después de quitar los avisos aceptados.
 * Un paquete que solo depende de uno aceptado también queda afuera.
 * @param {{ vulnerabilities?: Record<string, { name: string, severity: string, via?: unknown[] }> }} report
 * @returns {{ name: string, severity: string }[]}
 */
export function seriousVulnerabilities(report) {
  const all = report.vulnerabilities ?? {};
  const accepted = new Set(ACCEPTED_ADVISORIES.map((item) => item.id));
  /** @type {Map<string, boolean>} */
  const memo = new Map();
  /** @param {string} name @param {Set<string>} path */
  const isAccepted = (name, path) => {
    const known = memo.get(name);
    if (known !== undefined) {
      return known;
    }
    const entry = all[name];
    if (path.has(name)) {
      // Un ciclo entre paquetes no suma ningún aviso nuevo.
      return true;
    }
    if (!entry || entry.severity === 'critical') {
      return false;
    }
    const next = new Set(path).add(name);
    const result = (entry.via ?? []).every((via) => {
      if (typeof via === 'string') {
        return !isSerious(all[via]) || isAccepted(via, next);
      }
      return !isSerious(via) || accepted.has(advisoryIdOf(via));
    });
    memo.set(name, result);
    return result;
  };
  return Object.entries(all)
    .filter(([, entry]) => entry.severity === 'high' || entry.severity === 'critical')
    .filter(([name]) => !isAccepted(name, new Set()))
    .map(([name, entry]) => ({ name, severity: entry.severity }));
}
