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

const MARCADOR = /\$[A-Za-z_][\w.]*|%[sdifjoc#%]/;

function escapar(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Las pruebas con tabla de casos se listan con su plantilla («… $entrada … $esperado»):
// se reemplazan por los casos que corrieron de verdad. Si no corrió ninguno, queda la plantilla.
/**
 * @param {{ titulo: string, capa: string }[]} listadas
 * @param {Map<string, { titulo: string }>} pruebas
 * @returns {{ titulo: string, capa: string }[]}
 */
export function expandirPlantillas(listadas, pruebas) {
  return listadas.flatMap((listada) => {
    if (!MARCADOR.test(listada.titulo)) {
      return [listada];
    }
    const partes = listada.titulo.split(new RegExp(MARCADOR.source, 'g')).map(escapar);
    const patron = new RegExp(`^${partes.join('.+?')}$`);
    const casos = [...pruebas.values()]
      .filter((p) => patron.test(p.titulo))
      .map((p) => ({ titulo: p.titulo, capa: listada.capa }));
    return casos.length > 0 ? casos : [listada];
  });
}
