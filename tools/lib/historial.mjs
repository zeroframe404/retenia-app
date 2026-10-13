import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Lo último que se sabe de cada prueba, juntando la última corrida rápida y la última completa.
// Si una prueba corrió en las dos, vale la más reciente.
export function ultimosResultados(raiz) {
  const corridas = [];
  for (const archivo of ['rapida.json', 'todo.json']) {
    const ruta = join(raiz, '.cache', 'red', 'ultimo', archivo);
    if (existsSync(ruta)) {
      corridas.push(JSON.parse(readFileSync(ruta, 'utf8')));
    }
  }
  corridas.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pruebas = new Map();
  let cobertura = null;
  for (const corrida of corridas) {
    for (const prueba of corrida.pruebas) {
      pruebas.set(prueba.titulo, { ...prueba, fecha: corrida.fecha, modo: corrida.modo });
    }
    cobertura = corrida.cobertura ?? cobertura;
  }
  return { corridas, pruebas, cobertura };
}

export const ESTADOS = {
  paso: 'Pasó',
  fallo: 'Falló',
  salteada: 'Salteada',
  'sin-correr': 'Todavía no corrió',
};
