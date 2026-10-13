import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HISTORIA = /^## (H-\d{2}) · (Imprescindible|Importante) · Fase (\d{2})$/;
const CRITERIO = /^- \*\*(CA-\d{3})\*\*$/;
const FILA_DE_FASE = /^\| (\d{2}) \| ([^|]+?) \| ([^|]+?) \| ([^|]+?) \| (\d+) \|$/;

function quitarPrefijo(renglon, prefijo) {
  const texto = renglon.trim();
  if (!texto.startsWith(`- ${prefijo} `)) {
    return null;
  }
  return texto.slice(prefijo.length + 3).replace(/,$/, '');
}

// «CA-038 a CA-047, CA-372 a CA-376» → ['CA-038', …, 'CA-047', 'CA-372', …].
/** @param {string} texto @returns {string[]} */
export function expandirRangos(texto) {
  const ids = [];
  for (const tramo of texto.split(',').map((t) => t.trim())) {
    const rango = /^CA-(\d{3}) a CA-(\d{3})$/.exec(tramo);
    if (rango) {
      for (let n = Number(rango[1]); n <= Number(rango[2]); n++) {
        ids.push(`CA-${String(n).padStart(3, '0')}`);
      }
    } else if (/^CA-\d{3}$/.test(tramo)) {
      ids.push(tramo);
    } else {
      throw new Error(`No entiendo el tramo de criterios «${tramo}»`);
    }
  }
  return ids;
}

/**
 * @typedef {{ id: string, dado: string | null, cuando: string | null, entonces: string | null }} Criterio
 * @typedef {{ id: string, prioridad: string, fase: string, descripcion: string, criterios: Criterio[] }} Historia
 * @typedef {{ numero: string, nombre: string, historias: string[], criterios: string[] }} Fase
 * @typedef {{ historias: Historia[], fases: Fase[] }} Especificacion
 */

// Lee docs/especificacion/historias.md: historias con sus criterios y la tabla «Criterio por fase».
/** @param {string} texto @returns {Especificacion} */
export function leerEspecificacion(texto) {
  const renglones = texto.split(/\r?\n/);
  const historias = [];
  const fases = [];
  let actual = null;
  let enTablaDeFases = false;
  for (let i = 0; i < renglones.length; i++) {
    const renglon = renglones[i];
    if (renglon.startsWith('# ')) {
      enTablaDeFases = renglon === '# Criterio por fase';
      actual = null;
      continue;
    }
    if (enTablaDeFases) {
      if (renglon.startsWith('## ')) {
        enTablaDeFases = false;
        continue;
      }
      const fila = FILA_DE_FASE.exec(renglon);
      if (fila) {
        fases.push({
          numero: fila[1],
          nombre: fila[2],
          historias: fila[3].split(',').map((h) => h.trim()),
          criterios: expandirRangos(fila[4]),
        });
      }
      continue;
    }
    const historia = HISTORIA.exec(renglon);
    if (historia) {
      const descripcion = renglones.slice(i + 1).find((r) => r.trim() !== '') ?? '';
      actual = {
        id: historia[1],
        prioridad: historia[2],
        fase: historia[3],
        descripcion: descripcion.trim(),
        criterios: [],
      };
      historias.push(actual);
      continue;
    }
    const criterio = CRITERIO.exec(renglon);
    if (criterio && actual) {
      actual.criterios.push({
        id: criterio[1],
        dado: quitarPrefijo(renglones[i + 1] ?? '', 'Dado'),
        cuando: quitarPrefijo(renglones[i + 2] ?? '', 'cuando'),
        entonces: quitarPrefijo(renglones[i + 3] ?? '', 'entonces'),
      });
    }
  }
  return { historias, fases };
}

/** @param {string} raiz @returns {Especificacion} */
export function leerEspecificacionDelProyecto(raiz) {
  return leerEspecificacion(
    readFileSync(join(raiz, 'docs', 'especificacion', 'historias.md'), 'utf8'),
  );
}
