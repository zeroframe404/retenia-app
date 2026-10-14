// Gancho de commit: busca secretos en los archivos que entran en el commit y lo frena si
// encuentra uno. Uso: node tools/hooks/secretos.mjs <archivos…>
// Si el gancho mismo no puede arrancar, también frena el commit.
import { relative } from 'node:path';

const files = process.argv.slice(2);
if (files.length === 0) {
  process.exit(0);
}

try {
  const { ROOT, runPackage, stripColors } = await import('../lib/proceso.mjs');
  const r = await runPackage('secretlint', 'secretlint', [
    '--format',
    'json',
    '--no-color',
    ...files,
  ]);
  if (r.code === 0) {
    process.exit(0);
  }
  /** @type {any[]} */
  let report = [];
  try {
    const clean = stripColors(r.stdout);
    report = JSON.parse(clean.slice(clean.indexOf('[')));
  } catch {
    console.error(
      `No pude revisar secretos: ${stripColors(r.stderr).trim() || `código ${r.code}`}`,
    );
    process.exit(1);
  }
  console.error(
    'Commit frenado: encontré un posible secreto. Un secreto nunca va en el repositorio.',
  );
  for (const file of report) {
    for (const m of file.messages ?? []) {
      const rule = String(m.ruleId ?? '').replace('@secretlint/secretlint-rule-', '');
      console.error(
        `  ${relative(ROOT, file.filePath).split('\\').join('/')}:${m.loc?.start?.line ?? '?'} (${rule})`,
      );
    }
  }
  process.exit(1);
} catch (error) {
  console.error(
    `Commit frenado: no pude revisar secretos. ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
