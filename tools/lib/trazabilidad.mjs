import { criteriaInTitle, isMalformedTitle } from './resultados.mjs';

/**
 * @typedef {import('./especificacion.mjs').Spec} Spec
 * @typedef {import('./especificacion.mjs').Criterion} Criterion
 * @typedef {{ title: string, layer: string }} TitledTest
 * @typedef {Criterion & { story: string, phase: string, tests: TitledTest[] }} TracedCriterion
 */

// Cruza los criterios de la especificación con los títulos de las pruebas.
// Un criterio de una fase cerrada sin prueba es una falla; los de la fase en curso se
// exigen solo al cerrarla (requireCurrent).
/**
 * @param {{ spec: Spec, titles: TitledTest[], closed: string[], current: string | null, requireCurrent: boolean }} options
 */
export function crossCheck({ spec, titles, closed, current, requireCurrent }) {
  /** @type {Map<string, string>} */
  const phaseOf = new Map();
  for (const phase of spec.phases) {
    for (const id of phase.criteria) {
      phaseOf.set(id, phase.number);
    }
  }
  /** @type {Map<string, TitledTest[]>} */
  const testsOf = new Map();
  /** @type {string[]} */
  const problems = [];
  for (const { title, layer } of titles) {
    if (isMalformedTitle(title)) {
      problems.push(
        `la prueba «${title}» menciona un criterio pero no lo pone al principio entre corchetes (por ejemplo «[CA-002] …»).`,
      );
    }
    for (const id of criteriaInTitle(title)) {
      if (!phaseOf.has(id)) {
        problems.push(`la prueba «${title}» nombra ${id}, que no existe en la especificación.`);
        continue;
      }
      testsOf.set(id, [...(testsOf.get(id) ?? []), { title, layer }]);
    }
  }
  /** @type {TracedCriterion[]} */
  const criteria = spec.stories.flatMap((story) =>
    story.criteria.map((c) => ({
      ...c,
      story: story.id,
      phase: phaseOf.get(c.id) ?? story.phase,
      tests: testsOf.get(c.id) ?? [],
    })),
  );
  /** @param {string[]} numbers */
  const ofPhases = (numbers) => criteria.filter((c) => numbers.includes(c.phase));
  const considered = ofPhases([...closed, ...(current ? [current] : [])]);
  const required = ofPhases([...closed, ...(current && requireCurrent ? [current] : [])]);
  for (const c of required) {
    if (c.tests.length === 0) {
      const when = closed.includes(c.phase) ? 'cerrada' : 'que se está cerrando';
      problems.push(
        `el criterio ${c.id} (fase ${c.phase}, ${when}) no tiene ninguna prueba con «[${c.id}]» al principio del título.`,
      );
    }
  }
  return {
    criteria,
    covered: considered.filter((c) => c.tests.length > 0).length,
    total: considered.length,
    problems,
  };
}
