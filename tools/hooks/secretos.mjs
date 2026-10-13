// Gancho de commit: busca secretos en los archivos que entran en el commit y lo frena si
// encuentra uno. Uso: node tools/hooks/secretos.mjs <archivos…>
import { relative } from 'node:path';
import { correrPaquete, RAIZ, sinColores } from '../lib/proceso.mjs';

const archivos = process.argv.slice(2);
if (archivos.length === 0) {
  process.exit(0);
}

const r = await correrPaquete('secretlint', 'secretlint', [
  '--format',
  'json',
  '--no-color',
  ...archivos,
]);
if (r.codigo === 0) {
  process.exit(0);
}
let informe = [];
try {
  const limpio = sinColores(r.salida);
  informe = JSON.parse(limpio.slice(limpio.indexOf('[')));
} catch {
  console.error(
    `No pude revisar secretos: ${sinColores(r.errores).trim() || `código ${r.codigo}`}`,
  );
  process.exit(1);
}
console.error(
  'Commit frenado: encontré un posible secreto. Un secreto nunca va en el repositorio.',
);
for (const archivo of informe) {
  for (const m of archivo.messages ?? []) {
    const regla = String(m.ruleId ?? '').replace('@secretlint/secretlint-rule-', '');
    console.error(
      `  ${relative(RAIZ, archivo.filePath).split('\\').join('/')}:${m.loc?.start?.line ?? '?'} (${regla})`,
    );
  }
}
process.exit(1);
