// Los niveles de consecuencia de lo que devuelve la IA (Fase 19, docs/arquitectura.md §9). Ninguno
// deja que un modelo escriba datos de aprendizaje: lo más que puede hacer es proponer.
// - Exploración (explicar, conversar): se muestra marcada y nunca se guarda como dato de aprendizaje.
// - Práctica (tarjetas, ejercicios; Fases 21 y 22): queda como «Propuesta» hasta que vos, o una
//   regla fija de Retenia, la aceptan.
// - Dominio (lo que mueve repasos o estados; Fase 22): queda como «Propuesta» y solo se acepta con
//   tu confirmación o con una verificación independiente (otra corrida aparte que coincide, o un
//   control fijo).

export type ConsequenceLevel = 'exploration' | 'practice' | 'mastery';

export type Delivery = 'show' | 'proposal' | 'proposal_with_check';

export function deliveryFor(level: ConsequenceLevel): Delivery {
  switch (level) {
    case 'exploration':
      return 'show';
    case 'practice':
      return 'proposal';
    case 'mastery':
      return 'proposal_with_check';
  }
}
