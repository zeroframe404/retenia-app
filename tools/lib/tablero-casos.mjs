// La sección «Tablas de casos» del tablero: cada tabla (por ejemplo la «Tabla de casos del motor»
// de la Fase 09) se abre y muestra, por caso, la entrada, lo esperado, lo obtenido y si coincidió.
import { STATUS_LABELS } from './historial.mjs';

/** @typedef {import('./historial.mjs').KnownResult} KnownResult */

/** @param {unknown} text */
function h(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** @param {Iterable<KnownResult>} results */
export function casesSection(results) {
  /** @type {Map<string, KnownResult[]>} */
  const tables = new Map();
  for (const test of results) {
    if (test.tableCase) {
      tables.set(test.tableCase.table, [...(tables.get(test.tableCase.table) ?? []), test]);
    }
  }
  if (tables.size === 0) {
    return '<p class="nota">Todavía no hay tablas de casos con resultados.</p>';
  }
  return [...tables]
    .map(([table, rows]) => {
      const equal = rows.filter((t) => t.status === 'passed').length;
      const count = `${rows.length} ${rows.length === 1 ? 'caso' : 'casos'}`;
      const body = rows
        .map(
          (t) =>
            `<tr><td>${h(t.tableCase?.input)}</td><td>${h(t.tableCase?.expected)}</td><td>${h(t.tableCase?.actual)}</td><td><span class="chip ${t.status}">${h(STATUS_LABELS[t.status])}</span></td></tr>`,
        )
        .join('\n');
      return `<details class="casos"><summary>${h(table)} · ${count} · ${equal} ${equal === 1 ? 'igual' : 'iguales'}</summary>
<table><thead><tr><th>Entrada</th><th>Esperado</th><th>Obtenido</th><th>Resultado</th></tr></thead><tbody>
${body}
</tbody></table></details>`;
    })
    .join('\n');
}
