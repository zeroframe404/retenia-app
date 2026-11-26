import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { findSecret } from './lib/buscar-clave.mjs';

// «¿Mi clave está en algún archivo?» (M19.11): pide la clave sin mostrarla en pantalla y la busca
// entera, y también sus primeros y últimos 12 caracteres, en la carpeta de datos de Retenia (prueba)
// y de Retenia (con sus copias) y en los archivos o carpetas que le pases, por ejemplo la última
// exportación:
//   node tools/buscar-clave.mjs "C:\Users\vos\Desktop\Retenia 15-03-2027.zip"
// No guarda ni muestra la clave: solo dice dónde aparece, si aparece.

function askHidden(question) {
  return new Promise((resolve) => {
    const input = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = input._writeToOutput?.bind(input);
    input._writeToOutput = (text) => {
      if (text.includes(question)) {
        write?.(text);
      }
    };
    input.question(question, (answer) => {
      input.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const appData = process.env.APPDATA ?? '';
const roots = [
  join(appData, 'Retenia (prueba)'),
  join(appData, 'Retenia'),
  ...process.argv.slice(2),
];
const key = await askHidden('Pegá tu clave (no se va a ver) y apretá Enter: ');
if (key.length < 24) {
  console.log('Eso no parece una clave entera: no busqué nada.');
  process.exit(1);
}
const pieces = [key, key.slice(0, 12), key.slice(-12)];
let foundAny = false;
for (const [index, piece] of pieces.entries()) {
  const label = ['La clave entera', 'Sus primeros 12 caracteres', 'Sus últimos 12 caracteres'][
    index
  ];
  const hits = (await findSecret(piece, roots)).filter((hit) => !hit.unreadable);
  if (hits.length === 0) {
    console.log(`${label}: no aparece en ningún archivo.`);
    continue;
  }
  foundAny = true;
  console.log(`${label}: aparece en`);
  for (const hit of hits) {
    console.log(`  ${hit.file}${hit.inside ? ` (adentro: ${hit.inside})` : ''}`);
  }
}
process.exit(foundAny ? 2 : 0);
