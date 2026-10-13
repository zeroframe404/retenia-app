// Gancho de Claude Code (PostToolUse en Edit, Write y NotebookEdit): da formato al archivo
// recién escrito y lo revisa. Si queda algo mal, se lo devuelve a Claude (código 2).
import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { leerEntrada } from '../lib/gancho.mjs';
import { correrPaquete, RAIZ, sinColores } from '../lib/proceso.mjs';

const REVISABLES = /\.(ts|tsx|js|mjs|cjs|json|jsonc|css|grit)$/i;

const entrada = await leerEntrada();
const ruta = entrada?.tool_input?.file_path ?? entrada?.tool_input?.notebook_path;
if (typeof ruta !== 'string' || !REVISABLES.test(ruta) || !existsSync(ruta)) {
  process.exit(0);
}
// Solo archivos del proyecto. En Windows, un archivo de otra unidad da una ruta absoluta.
const relativa = relative(RAIZ, resolve(ruta));
if (relativa.startsWith('..') || isAbsolute(relativa)) {
  process.exit(0);
}

const r = await correrPaquete('@biomejs/biome', 'biome', [
  'check',
  '--write',
  '--error-on-warnings',
  '--no-errors-on-unmatched',
  '--files-ignore-unknown=true',
  '--reporter=json',
  '--colors=off',
  relativa,
]);
if (r.codigo === 0) {
  process.exit(0);
}
let diagnosticos = [];
try {
  const limpio = sinColores(r.salida);
  diagnosticos = JSON.parse(limpio.slice(limpio.indexOf('{'))).diagnostics ?? [];
} catch {
  diagnosticos = [];
}
const archivo = relativa.split('\\').join('/');
console.error(`Revisión de ${archivo}: quedó algo para arreglar.`);
if (diagnosticos.length === 0) {
  console.error(sinColores(`${r.salida}\n${r.errores}`).trim().slice(0, 2000));
}
for (const d of diagnosticos) {
  const renglon = d.location?.start?.line ? `:${d.location.start.line}` : '';
  console.error(`  ${archivo}${renglon}: ${d.message} (${d.category})`);
}
process.exit(2);
