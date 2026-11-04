// La tabla de casos del motor de memoria (docs/especificacion/casos-memoria.md, CA-059).
//   node tools/casos-memoria.mjs agregar "tarjeta nueva, La sabía el 15/03, La sabía en su fecha"
//       calcula el caso con la biblioteca, lo revisa contra la fórmula publicada de FSRS-6 y lo
//       agrega al final de la tabla con el número que sigue (se pueden pasar varios casos).
//   node tools/casos-memoria.mjs mostrar "<secuencia>"
//       lo mismo, sin agregarlo: solo dice qué fechas da.
//   node tools/casos-memoria.mjs revisar
//       vuelve a calcular todos los renglones con la biblioteca y con la fórmula, y avisa si alguno
//       ya no da lo congelado.

import { readFileSync } from 'node:fs';
import {
  appendCase,
  casesFile,
  computeCase,
  readCases,
  SequenceError,
} from './lib/casos-memoria.mjs';
import { ROOT } from './lib/proceso.mjs';

const [command, ...rest] = process.argv.slice(2);

function fail(/** @type {string} */ message) {
  console.error(message);
  process.exit(1);
}

try {
  if (command === 'agregar' || command === 'mostrar') {
    if (rest.length === 0) {
      fail('Falta la secuencia, entre comillas: «tarjeta nueva, La sabía el 15/03, …».');
    }
    for (const sequence of rest) {
      if (command === 'agregar') {
        const added = appendCase(ROOT, sequence);
        console.log(`Agregado ${added.id}: ${added.sequence}`);
        console.log(`  Fechas: ${added.expected.join(' · ')}`);
        console.log(`  Estabilidad y dificultad al final: ${added.memory}`);
      } else {
        const { expected, memory } = computeCase(sequence);
        console.log(
          `${sequence}\n  Fechas: ${expected.join(' · ')}\n  Estabilidad y dificultad al final: ${memory}`,
        );
      }
    }
  } else if (command === 'revisar') {
    const rows = readCases(readFileSync(casesFile(ROOT), 'utf8'));
    const wrong = [];
    for (const row of rows) {
      const { expected, memory } = computeCase(row.sequence);
      if (expected.join(' · ') !== row.expected.join(' · ') || memory !== row.memory) {
        wrong.push(
          `${row.id}: congelado ${row.expected.join(' · ')} (${row.memory}); hoy da ${expected.join(' · ')} (${memory})`,
        );
      }
    }
    if (wrong.length > 0) {
      fail(`Hay ${wrong.length} casos que ya no dan lo congelado:\n${wrong.join('\n')}`);
    }
    console.log(
      `Los ${rows.length} casos dan lo congelado, con la biblioteca y con la fórmula publicada.`,
    );
  } else {
    fail(
      'Uso: node tools/casos-memoria.mjs agregar "<secuencia>" | mostrar "<secuencia>" | revisar',
    );
  }
} catch (error) {
  if (error instanceof SequenceError) {
    fail(error.message);
  }
  throw error;
}
