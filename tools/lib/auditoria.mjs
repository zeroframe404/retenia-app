// Avisos de seguridad que se aceptan a conciencia, con fecha de revisión. Pasada la fecha vuelven
// a dar rojo. Cada uno tiene su motivo en docs/decisiones.md.
const ACCEPTED_ADVISORIES = [
  // picomatch: aviso sin versión corregida (la 4.0.7 es la última). Solo lo usan herramientas de
  // desarrollo y de armado; nada de esto viaja en el instalador.
  { url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf', reviewUntil: '2027-01-31' },
];

const SERIOUS = new Set(['high', 'critical']);

/**
 * Devuelve los paquetes con avisos altos o críticos que NO están explicados por un aviso aceptado.
 * Un paquete queda explicado si todo lo que lo hace vulnerable es un aviso aceptado y vigente, o
 * un paquete que a su vez está explicado.
 */
export function seriousFindings(report, today, accepted = ACCEPTED_ADVISORIES) {
  const vulnerabilities = report?.vulnerabilities ?? {};
  const valid = new Set(
    accepted.filter((a) => today <= new Date(`${a.reviewUntil}T23:59:59Z`)).map((a) => a.url),
  );
  const memo = new Map();
  const explained = (name, seen = new Set()) => {
    if (memo.has(name)) {
      return memo.get(name);
    }
    const entry = vulnerabilities[name];
    if (!entry) {
      return false;
    }
    if (seen.has(name)) {
      return true;
    }
    const next = new Set(seen).add(name);
    // Solo cuentan los avisos altos o críticos; los moderados no frenan la red.
    const ok = (entry.via ?? []).every((via) => {
      if (typeof via === 'string') {
        return !SERIOUS.has(vulnerabilities[via]?.severity) || explained(via, next);
      }
      return !SERIOUS.has(via.severity ?? 'high') || valid.has(via.url);
    });
    memo.set(name, ok);
    return ok;
  };
  return Object.entries(vulnerabilities)
    .filter(([, d]) => SERIOUS.has(d.severity))
    .map(([name]) => name)
    .filter((name) => !explained(name));
}
