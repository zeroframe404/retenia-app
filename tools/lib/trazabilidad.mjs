import { criteriosDelTitulo, tituloMalFormado } from './resultados.mjs';

// Cruza los criterios de la especificación con los títulos de las pruebas.
// Un criterio de una fase cerrada sin prueba es una falla; los de la fase en curso se
// exigen solo al cerrarla (exigirEnCurso).
export function cruzar({ especificacion, titulos, cerradas, enCurso, exigirEnCurso }) {
  const faseDe = new Map();
  for (const fase of especificacion.fases) {
    for (const id of fase.criterios) {
      faseDe.set(id, fase.numero);
    }
  }
  const pruebasDe = new Map();
  const problemas = [];
  const existentes = new Set(faseDe.keys());
  for (const { titulo, capa } of titulos) {
    if (tituloMalFormado(titulo)) {
      problemas.push(
        `la prueba «${titulo}» menciona un criterio pero no lo pone al principio entre corchetes (por ejemplo «[CA-002] …»).`,
      );
    }
    for (const id of criteriosDelTitulo(titulo)) {
      if (!existentes.has(id)) {
        problemas.push(`la prueba «${titulo}» nombra ${id}, que no existe en la especificación.`);
        continue;
      }
      if (!pruebasDe.has(id)) {
        pruebasDe.set(id, []);
      }
      pruebasDe.get(id).push({ titulo, capa });
    }
  }
  const criterios = especificacion.historias.flatMap((h) =>
    h.criterios.map((c) => ({
      ...c,
      historia: h.id,
      fase: faseDe.get(c.id) ?? h.fase,
      pruebas: pruebasDe.get(c.id) ?? [],
    })),
  );
  const deFases = (numeros) => criterios.filter((c) => numeros.includes(c.fase));
  const considerados = deFases([...cerradas, ...(enCurso ? [enCurso] : [])]);
  const exigidos = deFases([...cerradas, ...(enCurso && exigirEnCurso ? [enCurso] : [])]);
  for (const c of exigidos) {
    if (c.pruebas.length === 0) {
      const cuando = cerradas.includes(c.fase) ? 'cerrada' : 'que se está cerrando';
      problemas.push(
        `el criterio ${c.id} (fase ${c.fase}, ${cuando}) no tiene ninguna prueba con «[${c.id}]» al principio del título.`,
      );
    }
  }
  return {
    criterios,
    numerador: considerados.filter((c) => c.pruebas.length > 0).length,
    denominador: considerados.length,
    problemas,
  };
}
