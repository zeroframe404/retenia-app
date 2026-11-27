// El estado de cada función de IA (Fase 19): «Habilitada», «En revisión» (cuando el acuerdo con tus
// correcciones baja del 80 %, desde la Fase 22) o «Suspendida» (la suspendiste vos en Ajustes).
// Suspender manda sobre lo demás.

export type AiFunctionState = 'enabled' | 'in_review' | 'suspended';

export function functionState({
  suspended,
  inReview,
}: {
  suspended: boolean;
  inReview: boolean;
}): AiFunctionState {
  if (suspended) {
    return 'suspended';
  }
  return inReview ? 'in_review' : 'enabled';
}

const DAY_MS = 86_400_000;
const NOTICE_DAYS = 60;

// «Probar conexión» avisa desde 60 días antes de la fecha a partir de la cual el modelo se puede
// retirar (la de docs/versiones.md): hay que actualizar Retenia antes.
export function retiresSoon(today: string, notBefore: string): boolean {
  return Date.parse(notBefore) - Date.parse(today) <= NOTICE_DAYS * DAY_MS;
}
