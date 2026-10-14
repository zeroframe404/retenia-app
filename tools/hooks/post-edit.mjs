// Gancho de Claude Code (PostToolUse en Edit, Write y NotebookEdit): da formato al archivo
// recién escrito y lo revisa. Si queda algo mal, se lo devuelve a Claude (código 2). Si el
// gancho mismo no puede arrancar, también lo dice con código 2.
import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { readHookInput } from '../lib/gancho.mjs';

const REVIEWABLE = /\.(ts|tsx|js|mjs|cjs|json|jsonc|css|grit)$/i;

const input = await readHookInput();
const path = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
if (typeof path !== 'string' || !REVIEWABLE.test(path) || !existsSync(path)) {
  process.exit(0);
}

try {
  const { ROOT, runPackage, stripColors } = await import('../lib/proceso.mjs');
  // Solo archivos del proyecto. En Windows, un archivo de otra unidad da una ruta absoluta.
  const relativePath = relative(ROOT, resolve(path));
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    process.exit(0);
  }
  const file = relativePath.split('\\').join('/');
  const r = await runPackage('@biomejs/biome', 'biome', [
    'check',
    '--write',
    '--error-on-warnings',
    '--no-errors-on-unmatched',
    '--files-ignore-unknown=true',
    '--reporter=json',
    '--colors=off',
    relativePath,
  ]);
  if (r.code === 0) {
    process.exit(0);
  }
  /** @type {any[]} */
  let diagnostics = [];
  try {
    const clean = stripColors(r.stdout);
    diagnostics = JSON.parse(clean.slice(clean.indexOf('{'))).diagnostics ?? [];
  } catch {
    diagnostics = [];
  }
  console.error(`Revisión de ${file}: quedó algo para arreglar.`);
  if (diagnostics.length === 0) {
    console.error(stripColors(`${r.stdout}\n${r.stderr}`).trim().slice(0, 2000));
  }
  for (const d of diagnostics) {
    const line = d.location?.start?.line ? `:${d.location.start.line}` : '';
    console.error(`  ${file}${line}: ${d.message} (${d.category})`);
  }
  process.exit(2);
} catch (error) {
  console.error(
    `Revisión de archivos: el gancho no pudo arrancar. ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(2);
}
