import { currentEvaluation } from '../core/ledger';
import type { StepState } from '../core/procedure';

// Cómo terminó cada paso vacío de un intento ya evaluado de un procedimiento, según su evaluación
// vigente (nulo si quedó sin evaluar o «Discrepo» lo dejó sin contar). Lo usan la escalera, el
// micro-ejercicio y «Mis errores».
export function stepStatesOf(
  versions: readonly {
    id: string;
    version: number;
    components: string | null;
    affected: number;
  }[],
): { id: string; state: StepState }[] | null {
  const current = currentEvaluation(versions);
  if (current === null || current.affected === 1 || current.components === null) {
    return null;
  }
  const parsed = JSON.parse(current.components) as { steps?: { id: string; state: StepState }[] };
  return parsed.steps ?? null;
}
